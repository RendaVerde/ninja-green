import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getConnectionCredentials } from "@/lib/whatsapp/connection-config";
import { createWhatsAppProvider } from "@/lib/whatsapp/factory";
import { WhatsAppProviderError } from "@/lib/whatsapp/provider";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { id } = await context.params;
  const { data: connection, error } = await supabase
    .from("whatsapp_connections")
    .select("id,provider,endpoint_url,instance_name,channel_id,active,last_tested_at,circuit_open_until")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error || !connection) {
    return NextResponse.json(
      { error: "Conexão não encontrada." },
      { status: 404 },
    );
  }
  if (connection.provider !== "zpro") {
    return NextResponse.json(
      { error: "O teste remoto está disponível inicialmente apenas para ZPRO." },
      { status: 400 },
    );
  }
  if (!connection.active) {
    return NextResponse.json(
      { error: "Ative a conexão antes de testá-la." },
      { status: 400 },
    );
  }
  if (!connection.channel_id) {
    return NextResponse.json(
      { error: "Informe o ID do canal antes de testar a conexão." },
      { status: 400 },
    );
  }
  const { data: settings } = await supabase
    .from("outbound_settings")
    .select("connection_test_interval_seconds")
    .eq("user_id", user.id)
    .maybeSingle();
  const minimumInterval = settings?.connection_test_interval_seconds ?? 60;
  if (
    connection.last_tested_at &&
    Date.now() - new Date(connection.last_tested_at).getTime() <
      minimumInterval * 1000
  ) {
    const retryAfter = Math.ceil(
      minimumInterval -
        (Date.now() - new Date(connection.last_tested_at).getTime()) / 1000,
    );
    return NextResponse.json(
      { error: `Aguarde ${retryAfter}s antes de testar novamente.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  if (
    connection.circuit_open_until &&
    new Date(connection.circuit_open_until) > new Date()
  ) {
    const retryAfter = Math.max(
      1,
      Math.ceil(
        (new Date(connection.circuit_open_until).getTime() - Date.now()) / 1000,
      ),
    );
    return NextResponse.json(
      { error: "O provedor está temporariamente indisponível." },
      { status: 503, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    const credentials = await getConnectionCredentials(
      connection.id,
      connection.endpoint_url,
      connection.instance_name,
    );
    const provider = createWhatsAppProvider("zpro", credentials);
    const result = await provider.testConnection(connection.channel_id);
    await createSupabaseAdminClient().rpc("record_provider_circuit_result", {
      target_base_url: credentials.baseUrl,
      target_success: true,
      target_failure_message: null,
    });
    await supabase
      .from("whatsapp_connections")
      .update({
        health_status: "ready",
        health_error: null,
        health_checked_at: new Date().toISOString(),
        last_tested_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("owner_id", user.id);
    return NextResponse.json(result);
  } catch (testError) {
    const errorMessage =
      testError instanceof Error
        ? testError.message
        : "Não foi possível testar a conexão ZPRO.";
    if (
      connection.endpoint_url &&
      testError instanceof WhatsAppProviderError &&
      (testError.code === "ZPRO_CONNECTION_ERROR" ||
        testError.code === "ZPRO_TIMEOUT" ||
        [502, 503, 504].includes(testError.status))
    ) {
      await createSupabaseAdminClient().rpc("record_provider_circuit_result", {
        target_base_url: connection.endpoint_url,
        target_success: false,
        target_failure_message: errorMessage,
      });
    }
    await supabase
      .from("whatsapp_connections")
      .update({
        health_status: "error",
        health_error: errorMessage,
        health_checked_at: new Date().toISOString(),
        last_tested_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("owner_id", user.id);
    if (testError instanceof WhatsAppProviderError) {
      return NextResponse.json(
        { error: testError.message, code: testError.code },
        {
          status:
            testError.status >= 400 && testError.status <= 599
              ? testError.status
              : 502,
        },
      );
    }
    return NextResponse.json(
      {
        error:
          errorMessage,
      },
      { status: 500 },
    );
  }
}
