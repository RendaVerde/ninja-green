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
    .select("id,provider,endpoint_url,instance_name,active")
    .eq("id", id)
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

  try {
    const credentials = await getConnectionCredentials(
      connection.id,
      connection.endpoint_url,
      connection.instance_name,
    );
    const provider = createWhatsAppProvider("zpro", credentials);
    return NextResponse.json(await provider.testConnection());
  } catch (testError) {
    if (testError instanceof WhatsAppProviderError) {
      return NextResponse.json(
        { error: testError.message, code: testError.code },
        { status: testError.status >= 500 ? testError.status : 502 },
      );
    }
    return NextResponse.json(
      {
        error:
          testError instanceof Error
            ? testError.message
            : "Não foi possível testar a conexão ZPRO.",
      },
      { status: 500 },
    );
  }
}
