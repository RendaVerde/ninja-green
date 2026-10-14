import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WhatsAppProviderCredentials } from "@/lib/whatsapp/provider";

export function normalizeZproBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") {
    throw new Error("A BaseUrl da ZPRO deve usar HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("A BaseUrl não pode conter usuário ou senha.");
  }

  const hostname = url.hostname.toLowerCase();
  const privateIpv4 =
    /^(10\.|127\.|169\.254\.|192\.168\.|0\.)/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    privateIpv4
  ) {
    throw new Error("A BaseUrl deve apontar para um endereço público.");
  }

  return url.toString().replace(/\/+$/, "");
}

export function maskApiId(apiId: string | null) {
  if (!apiId) return "";
  if (apiId.length <= 4) return "••••";
  return `••••${apiId.slice(-4)}`;
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
