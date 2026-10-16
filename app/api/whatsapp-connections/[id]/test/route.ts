import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
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
    .select("id,provider,endpoint_url,instance_name,channel_id,active")
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

  try {
    const credentials = await getConnectionCredentials(
      connection.id,
      connection.endpoint_url,
      connection.instance_name,
    );
    const provider = createWhatsAppProvider("zpro", credentials);
    const result = await provider.testConnection(connection.channel_id);
    await supabase
      .from("whatsapp_connections")
      .update({
        health_status: "ready",
        health_error: null,
        health_checked_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("owner_id", user.id);
    return NextResponse.json(result);
  } catch (testError) {
    const errorMessage =
      testError instanceof Error
        ? testError.message
        : "Não foi possível testar a conexão ZPRO.";
    await supabase
      .from("whatsapp_connections")
      .update({
        health_status: "error",
        health_error: errorMessage,
        health_checked_at: new Date().toISOString(),
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
