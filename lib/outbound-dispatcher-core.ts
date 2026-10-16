export type ClaimedOutboundMessage = {
  id: string;
  ownerId: string;
  contactId: string;
  connectionId: string;
  body: string;
  source: "single" | "quick" | "sequence";
  claimToken: string;
};

export type OutboundDeliveryContext = ClaimedOutboundMessage & {
  phone: string;
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
  released: number;
};

function toFailure(error: unknown): DispatchFailure {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : "WHATSAPP_SEND_ERROR",
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : "Não foi possível enviar a mensagem.",
      status: typeof candidate.status === "number" ? candidate.status : undefined,
    };
  }
  return {
    code: "WHATSAPP_SEND_ERROR",
    message: "Não foi possível enviar a mensagem.",
  };
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
    try {
      const context = await store.loadContext(message);
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
      summary.sent += 1;
    } catch (error) {
      const failure = toFailure(error);
      if (
        !requestStarted &&
        (failure.code === "OUTBOUND_LIVE_SEND_DISABLED" ||
          failure.code === "OUTBOUND_PAUSED")
      ) {
        await store.releaseUnstarted([message]);
        summary.released += 1;
        continue;
      }
      if (requestStarted && !isProvablyNotSent(failure)) {
        await store.markUnknown(message, failure);
        summary.unknown += 1;
      } else {
        await store.markFailed(message, failure);
        summary.failed += 1;
      }
    }
  }

  return summary;
}
