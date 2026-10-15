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
  id?: string | number;
  data?: Record<string, unknown>;
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
      const responseBody = await response.text();
      if (suffix === "/showChannelById") {
        if (response.status === 401 || response.status === 403) {
          throw new WhatsAppProviderError(
            "Credencial ZPRO inválida.",
            "ZPRO_INVALID_CREDENTIALS",
            response.status,
          );
        }
        if (response.status >= 500) {
          throw new WhatsAppProviderError(
            "A ZPRO apresentou um erro ao consultar o canal.",
            "ZPRO_SERVER_ERROR",
            response.status,
          );
        }
        if (response.status === 404 || !responseBody) {
          throw new WhatsAppProviderError(
            "Canal ZPRO não encontrado para o ID informado.",
            "ZPRO_CHANNEL_NOT_FOUND",
            404,
          );
        }
      }
      let payload: ZproPayload = {};
      if (responseBody) {
        try {
          payload = JSON.parse(responseBody) as ZproPayload;
        } catch {
          throw new WhatsAppProviderError(
            "A ZPRO retornou uma resposta inválida.",
            "ZPRO_INVALID_RESPONSE",
            502,
          );
        }
      }
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
        "Não foi possível conectar à ZPRO. Verifique a BaseUrl.",
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

  async testConnection(channelId?: number): Promise<WhatsAppConnectionTestResult> {
    if (!channelId || !Number.isSafeInteger(channelId) || channelId <= 0) {
      throw new WhatsAppProviderError(
        "Informe um ID de canal válido antes de testar.",
        "ZPRO_CHANNEL_ID_REQUIRED",
        400,
      );
    }
    const payload = await this.request("/showChannelById", {
      id: channelId,
    });
    const status =
      typeof payload.status === "string"
        ? payload.status
        : typeof payload.data?.status === "string"
          ? payload.data.status
        : typeof payload.state === "string"
          ? payload.state
          : undefined;
    const rawChannelId = payload.id ?? payload.data?.id;
    const returnedChannelId =
      typeof rawChannelId === "number"
        ? rawChannelId
        : typeof rawChannelId === "string" && /^\d+$/.test(rawChannelId)
          ? Number(rawChannelId)
          : undefined;
    return {
      ok: true,
      message: status
        ? `Conexão ZPRO disponível (${status}).`
        : "Conexão ZPRO validada com sucesso.",
      channelStatus: status,
      channelId:
        returnedChannelId !== undefined && Number.isSafeInteger(returnedChannelId)
          ? returnedChannelId
          : undefined,
    };
  }
}
