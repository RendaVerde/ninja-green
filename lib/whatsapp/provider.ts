export type WhatsAppProviderName =
  | "uazapi"
  | "baileys"
  | "evolution"
  | "evolution_go"
  | "zpro";

export type WhatsAppProviderCredentials = {
  baseUrl: string;
  apiId: string;
  token: string;
};

export type SendTextInput = {
  body: string;
  number: string;
  externalKey: string;
  isClosed?: boolean;
  validateNumber?: boolean;
};

export type SendMediaInput = SendTextInput & {
  mediaUrl: string;
  mimeType?: string;
  fileName?: string;
};

export type WhatsAppSendResult = {
  mode: "provider" | "manual";
  provider: WhatsAppProviderName | "manual";
  providerMessageId?: string;
  ticketId?: string;
  whatsappUrl?: string | null;
  rawStatus?: string;
};

export type WhatsAppConnectionTestResult = {
  ok: boolean;
  message: string;
  channelStatus?: string;
  channelId?: number;
};

export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName | "manual";
  sendText(input: SendTextInput): Promise<WhatsAppSendResult>;
  sendMedia(input: SendMediaInput): Promise<WhatsAppSendResult>;
  testConnection(channelNumber?: string): Promise<WhatsAppConnectionTestResult>;
}

export class WhatsAppProviderError extends Error {
  constructor(
    message: string,
    public readonly code = "PROVIDER_ERROR",
    public readonly status = 502,
  ) {
    super(message);
    this.name = "WhatsAppProviderError";
  }
}
