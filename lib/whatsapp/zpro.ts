import "server-only";

import type {
  SendMediaInput,
  SendTextInput,
  WhatsAppConnectionTestResult,
  WhatsAppProvider,
  WhatsAppProviderCredentials,
  WhatsAppSendResult,
} from "@/lib/whatsapp/provider";
import { WhatsAppProviderError } from "@/lib/whatsapp/provider";

const requestTimeoutMs = 10_000;

type ZproPayload = Record<string, unknown> & {
  success?: boolean;
  error?: string;
  message?: string;
  idFront?: string;
  messageId?: string;
  ticketId?: string | number;
  status?: string;
};

function providerError(payload: ZproPayload, responseStatus: number) {
  const code = typeof payload.error === "string" ? payload.error : "ZPRO_ERROR";
  const message =
    typeof payload.message === "string"
      ? payload.message
      : "A ZPRO recusou a solicitação.";
  return new WhatsAppProviderError(message, code, responseStatus || 502);
}

export class ZproWhatsAppProvider implements WhatsAppProvider {
  readonly name = "zpro" as const;

  constructor(private readonly credentials: WhatsAppProviderCredentials) {}

  private endpoint(suffix = "") {
    const baseUrl = this.credentials.baseUrl.replace(/\/+$/, "");
    const apiId = encodeURIComponent(this.credentials.apiId);
    return `${baseUrl}/v2/api/external/${apiId}${suffix}`;
  }

  private async request(suffix: string, body?: Record<string, unknown>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const token = this.credentials.token.replace(/^Bearer\s+/i, "").trim();

    try {
      const response = await fetch(this.endpoint(suffix), {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as ZproPayload;
      if (!response.ok || payload.success === false) {
        throw providerError(payload, response.status);
      }
      return payload;
    } catch (error) {
      if (error instanceof WhatsAppProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new WhatsAppProviderError(
          "A ZPRO não respondeu dentro do tempo esperado.",
          "ZPRO_TIMEOUT",
          504,
        );
      }
      throw new WhatsAppProviderError(
        "Não foi possível conectar à ZPRO.",
        "ZPRO_CONNECTION_ERROR",
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async sendText(input: SendTextInput): Promise<WhatsAppSendResult> {
    const payload = await this.request("", {
      body: input.body,
      number: input.number,
      externalKey: input.externalKey,
      isClosed: input.isClosed ?? false,
      validateNumber: input.validateNumber ?? true,
    });
    return {
      mode: "provider",
      provider: "zpro",
      providerMessageId: payload.messageId || payload.idFront,
      ticketId:
        payload.ticketId === undefined ? undefined : String(payload.ticketId),
      rawStatus:
        typeof payload.status === "string" ? payload.status : undefined,
    };
  }

  async sendMedia(input: SendMediaInput): Promise<WhatsAppSendResult> {
    const payload = await this.request("/url", {
      body: input.body,
      number: input.number,
      externalKey: input.externalKey,
      isClosed: input.isClosed ?? false,
      validateNumber: input.validateNumber ?? true,
      mediaUrl: input.mediaUrl,
    });
    return {
      mode: "provider",
      provider: "zpro",
      providerMessageId: payload.messageId || payload.idFront,
      ticketId:
        payload.ticketId === undefined ? undefined : String(payload.ticketId),
      rawStatus:
        typeof payload.status === "string" ? payload.status : undefined,
    };
  }

  async testConnection(): Promise<WhatsAppConnectionTestResult> {
    const payload = await this.request("/showChannel");
    const status =
      typeof payload.status === "string"
        ? payload.status
        : typeof payload.state === "string"
          ? payload.state
          : undefined;
    return {
      ok: true,
      message: status
        ? `Conexão ZPRO disponível (${status}).`
        : "Conexão ZPRO validada com sucesso.",
      channelStatus: status,
    };
  }
}
