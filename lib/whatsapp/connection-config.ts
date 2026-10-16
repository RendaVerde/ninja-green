import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WhatsAppProviderCredentials } from "@/lib/whatsapp/provider";
import {
  maskZproApiId,
  parseZproConnectionAddress,
} from "@/lib/whatsapp/zpro-connection";

export function normalizeZproBaseUrl(value: string) {
  return parseZproConnectionAddress(value).baseUrl;
}

export function maskApiId(apiId: string | null) {
  return maskZproApiId(apiId || "");
}

export async function saveConnectionToken(connectionId: string, token: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("whatsapp_connection_secrets").upsert(
    {
      connection_id: connectionId,
      api_token: token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (error) throw new Error("Não foi possível proteger o token da conexão.");
}

export async function getConnectionTokens(connectionIds: string[]) {
  if (!connectionIds.length) return new Set<string>();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("whatsapp_connection_secrets")
    .select("connection_id")
    .in("connection_id", connectionIds);
  if (error) throw new Error("Não foi possível consultar as credenciais.");
  return new Set((data || []).map((item) => item.connection_id));
}

export async function getConnectionCredentials(
  connectionId: string,
  baseUrl: string | null,
  apiId: string | null,
): Promise<WhatsAppProviderCredentials> {
  if (!baseUrl || !apiId) throw new Error("A conexão ZPRO está incompleta.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("whatsapp_connection_secrets")
    .select("api_token")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error || !data?.api_token) {
    throw new Error("O token da conexão ZPRO não foi configurado.");
  }
  return {
    baseUrl: normalizeZproBaseUrl(baseUrl),
    apiId,
    token: data.api_token,
  };
}

export async function getOwnedConnectionCredentials(
  ownerId: string,
  connectionId: string,
): Promise<WhatsAppProviderCredentials> {
  const admin = createSupabaseAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("whatsapp_connections")
    .select("id,endpoint_url,instance_name")
    .eq("id", connectionId)
    .eq("owner_id", ownerId)
    .eq("provider", "zpro")
    .maybeSingle();
  if (connectionError) {
    throw new Error("Não foi possível consultar a conexão ZPRO.");
  }
  if (!connection) {
    throw new Error("A conexão ZPRO não pertence ao dono da mensagem.");
  }
  return getConnectionCredentials(
    connection.id,
    connection.endpoint_url,
    connection.instance_name,
  );
}
