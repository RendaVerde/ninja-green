import "server-only";

import { ManualWhatsAppProvider } from "@/lib/whatsapp/manual";
import type {
  WhatsAppProvider,
  WhatsAppProviderCredentials,
  WhatsAppProviderName,
} from "@/lib/whatsapp/provider";
import { ZproWhatsAppProvider } from "@/lib/whatsapp/zpro";

export function createWhatsAppProvider(
  provider: WhatsAppProviderName,
  credentials?: WhatsAppProviderCredentials,
): WhatsAppProvider {
  if (provider === "zpro" && credentials) {
    return new ZproWhatsAppProvider(credentials);
  }
  return new ManualWhatsAppProvider();
}
