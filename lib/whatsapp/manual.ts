import { buildWhatsAppUrl } from "@/lib/whatsapp";
import type {
  SendMediaInput,
  SendTextInput,
  WhatsAppConnectionTestResult,
  WhatsAppProvider,
  WhatsAppSendResult,
} from "@/lib/whatsapp/provider";

export class ManualWhatsAppProvider implements WhatsAppProvider {
  readonly name = "manual" as const;

  async sendText(input: SendTextInput): Promise<WhatsAppSendResult> {
    return {
      mode: "manual",
      provider: "manual",
      whatsappUrl: buildWhatsAppUrl(input.number, input.body),
    };
  }

  async sendMedia(input: SendMediaInput): Promise<WhatsAppSendResult> {
    return this.sendText(input);
  }

  async testConnection(): Promise<WhatsAppConnectionTestResult> {
    return {
      ok: true,
      message: "O envio manual pelo WhatsApp está disponível.",
      channelStatus: "manual",
    };
  }
}
