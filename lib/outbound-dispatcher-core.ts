export type ClaimedOutboundMessage = {
  id: string;
  ownerId: string;
  contactId: string;
  connectionId: string;
  body: string;
  source: "single" | "quick" | "sequence";
  claimToken: string;
  attemptCount: number;
};

export type OutboundDeliveryContext = ClaimedOutboundMessage & {
  phone: string;
  baseUrl: string;
};

export type ProviderDeliveryResult = {
  provider: string;
  providerMessageId?: string;
  ticketId?: string;
  rawStatus?: string;
};

export type DispatchFailure = {
  code: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
};

export interface OutboundDispatchStore {
  claim(input: {
    dispatcherId: string;
    ownerId?: string;
    batchSize: number;
    perConnectionLimit: number;
    leaseSeconds: number;
  }): Promise<ClaimedOutboundMessage[]>;
  loadContext(message: ClaimedOutboundMessage): Promise<OutboundDeliveryContext>;
  markRequestStarted(message: ClaimedOutboundMessage): Promise<boolean>;
  markSent(
    message: ClaimedOutboundMessage,
    result: ProviderDeliveryResult,
  ): Promise<void>;
  markFailed(message: ClaimedOutboundMessage, failure: DispatchFailure): Promise<void>;
  markUnknown(message: ClaimedOutboundMessage, failure: DispatchFailure): Promise<void>;
  markRetry(
    message: ClaimedOutboundMessage,
    failure: DispatchFailure,
    delaySeconds: number,
    consumeAttempt: boolean,
  ): Promise<void>;
  recordProviderSuccess(context: OutboundDeliveryContext): Promise<void>;
  recordProviderFailure(
    context: OutboundDeliveryContext,
    failure: DispatchFailure,
  ): Promise<void>;
  releaseUnstarted(messages: ClaimedOutboundMessage[]): Promise<void>;
}

export interface OutboundProvider {
  sendText(input: {
    body: string;
    number: string;
    externalKey: string;
  }): Promise<ProviderDeliveryResult>;
}

export type OutboundProviderFactory = (
  context: OutboundDeliveryContext,
) => Promise<OutboundProvider>;

export type DispatcherSummary = {
  claimed: number;
  sent: number;
  failed: number;
  unknown: number;
  retried: number;
  deferred: number;
  released: number;
};

function toFailure(error: unknown): DispatchFailure {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      status?: unknown;
      retryAfterSeconds?: unknown;
    };
    return {
      code: typeof candidate.code === "string" ? candidate.code : "WHATSAPP_SEND_ERROR",
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : "Não foi possível enviar a mensagem.",
      status: typeof candidate.status === "number" ? candidate.status : undefined,
      retryAfterSeconds:
        typeof candidate.retryAfterSeconds === "number"
          ? candidate.retryAfterSeconds
          : undefined,
    };
  }
  return {
    code: "WHATSAPP_SEND_ERROR",
    message: "Não foi possível enviar a mensagem.",
  };
}

export function isCircuitFailure(failure: DispatchFailure) {
  return (
    failure.code === "ZPRO_CONNECTION_ERROR" ||
    failure.code === "ZPRO_TIMEOUT" ||
    failure.status === 502 ||
    failure.status === 503 ||
    failure.status === 504
  );
}

export function isProvablyNotSent(failure: DispatchFailure) {
  return Boolean(
    failure.status &&
      failure.status >= 400 &&
      failure.status < 500 &&
      failure.status !== 408 &&
      failure.status !== 409 &&
      failure.status !== 425 &&
      failure.status !== 429,
  );
}

export async function runOutboundDispatcher(
  store: OutboundDispatchStore,
  providerFactory: OutboundProviderFactory,
  options: {
    ownerId?: string;
    maxDurationMs: number;
    providerBudgetMs: number;
    batchSize: number;
    perConnectionLimit: number;
    leaseSeconds: number;
    dispatcherId?: string;
  },
): Promise<DispatcherSummary> {
  const startedAt = Date.now();
  const dispatcherId = options.dispatcherId || crypto.randomUUID();
  const claimed = await store.claim({
    dispatcherId,
    ownerId: options.ownerId,
    batchSize: options.batchSize,
    perConnectionLimit: options.perConnectionLimit,
    leaseSeconds: options.leaseSeconds,
  });
  const summary: DispatcherSummary = {
    claimed: claimed.length,
    sent: 0,
    failed: 0,
    unknown: 0,
    retried: 0,
    deferred: 0,
    released: 0,
  };

  for (const [index, message] of claimed.entries()) {
    if (Date.now() - startedAt + options.providerBudgetMs >= options.maxDurationMs) {
      const remaining = claimed.slice(index);
      await store.releaseUnstarted(remaining);
      summary.released += remaining.length;
      break;
    }

    let requestStarted = false;
    let context: OutboundDeliveryContext | null = null;
    try {
      context = await store.loadContext(message);
      const provider = await providerFactory(context);
      requestStarted = await store.markRequestStarted(message);
      if (!requestStarted) {
        await store.releaseUnstarted([message]);
        summary.released += 1;
        continue;
      }
      const result = await provider.sendText({
        body: context.body,
        number: context.phone,
        externalKey: context.id,
      });
      await store.markSent(message, result);
      await store.recordProviderSuccess(context).catch(() => undefined);
      summary.sent += 1;
    } catch (error) {
      const failure = toFailure(error);
      if (context && isCircuitFailure(failure)) {
        await store.recordProviderFailure(context, failure).catch(() => undefined);
      }
      if (
        !requestStarted &&
        (failure.code === "OUTBOUND_LIVE_SEND_DISABLED" ||
          failure.code === "OUTBOUND_PAUSED" ||
          failure.code === "PROVIDER_CIRCUIT_OPEN")
      ) {
        await store.releaseUnstarted([message]);
        summary.released += 1;
        continue;
      }
      if (requestStarted && failure.status === 429) {
        await store.markRetry(
          message,
          failure,
          Math.max(60, failure.retryAfterSeconds || 60),
          false,
        );
        summary.deferred += 1;
        continue;
      }
      if (requestStarted && !isProvablyNotSent(failure)) {
        if (message.attemptCount === 1) {
          await store.markRetry(message, failure, 60, true);
          summary.retried += 1;
        } else {
          await store.markUnknown(message, failure);
          summary.unknown += 1;
        }
      } else {
        await store.markFailed(message, failure);
        summary.failed += 1;
      }
    }
  }

  return summary;
}
