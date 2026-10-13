import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getConnectionCredentials } from "@/lib/whatsapp/connection-config";
import { createWhatsAppProvider } from "@/lib/whatsapp/factory";
import { ManualWhatsAppProvider } from "@/lib/whatsapp/manual";
import type { WhatsAppProvider } from "@/lib/whatsapp/provider";

export async function resolveWhatsAppProvider(
  supabase: SupabaseClient,
): Promise<WhatsAppProvider> {
  const { data: connection, error } = await supabase
    .from("whatsapp_connections")
    .select("id,provider,endpoint_url,instance_name")
    .eq("provider", "zpro")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Não foi possível consultar a conexão WhatsApp.");
  if (!connection) return new ManualWhatsAppProvider();

  const credentials = await getConnectionCredentials(
    connection.id,
    connection.endpoint_url,
    connection.instance_name,
  );
  return createWhatsAppProvider("zpro", credentials);
}
