import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const number = process.env.ZPRO_DUPLICATE_TEST_NUMBER;
const dryRun = process.env.ZPRO_DUPLICATE_TEST_DRY_RUN === "1";
if (
  (!dryRun && process.env.ZPRO_DUPLICATE_TEST_CONFIRMED !== "send-twice") ||
  !number ||
  !/^55\d{10,11}$/.test(number)
) {
  throw new Error(
    "Defina ZPRO_DUPLICATE_TEST_NUMBER e confirme com ZPRO_DUPLICATE_TEST_CONFIRMED=send-twice.",
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("As credenciais de servidor do Supabase não estão configuradas.");
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: connections, error: connectionError } = await admin
  .from("whatsapp_connections")
  .select("id,owner_id,endpoint_url,instance_name")
  .eq("provider", "zpro")
  .eq("active", true);
if (connectionError || connections?.length !== 1) {
  throw new Error("O teste exige exatamente uma conexão ZPRO ativa.");
}
const connection = connections[0];
if (!connection.endpoint_url || !connection.instance_name) {
  throw new Error("A conexão ZPRO está incompleta.");
}
const { data: ownedConnection, error: ownerError } = await admin
  .from("whatsapp_connections")
  .select("id")
  .eq("id", connection.id)
  .eq("owner_id", connection.owner_id)
  .eq("provider", "zpro")
  .maybeSingle();
if (ownerError || !ownedConnection) {
  throw new Error("A conexão não pertence ao proprietário selecionado.");
}
const { data: secret, error: secretError } = await admin
  .from("whatsapp_connection_secrets")
  .select("api_token")
  .eq("connection_id", ownedConnection.id)
  .maybeSingle();
if (secretError || !secret?.api_token) {
  throw new Error("A conexão ZPRO não tem token configurado.");
}

const parsedUrl = new URL(connection.endpoint_url);
if (parsedUrl.protocol !== "https:") {
  throw new Error("A conexão ZPRO não usa HTTPS.");
}
const baseUrl = parsedUrl.origin;
if (dryRun) {
  process.stdout.write("Conexão ZPRO única, propriedade e token verificados; nenhum envio realizado.\n");
  process.exit(0);
}
const apiId = encodeURIComponent(connection.instance_name);
const endpoint = `${baseUrl}/v2/api/external/${apiId}`;
const externalKey = randomUUID();
const body = `Teste de chave repetida Ninja Green ${externalKey.slice(0, 8)}`;
const payload = JSON.stringify({
  body,
  number,
  externalKey,
  isClosed: false,
  validateNumber: true,
});

async function send(attempt) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${secret.api_token.replace(/^Bearer\s+/i, "").trim()}`,
      "Content-Type": "application/json",
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  const raw = await response.text();
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A resposta bruta pode conter dados pessoais; não é registrada.
  }
  const result = {
    attempt,
    httpStatus: response.status,
    success: parsed.success ?? response.ok,
    error: typeof parsed.error === "string" ? parsed.error : null,
    messageId: parsed.messageId ?? parsed.idFront ?? null,
    ticketId: parsed.ticketId ?? null,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

process.stdout.write(`externalKey=${externalKey}; destino final=${number.slice(-4)}\n`);
const first = await send(1);
if (first.httpStatus < 200 || first.httpStatus >= 300 || first.success === false) {
  throw new Error("A primeira chamada não confirmou aceitação; segunda chamada cancelada.");
}
await send(2);
