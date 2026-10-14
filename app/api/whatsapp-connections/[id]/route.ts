import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getConnectionTokens,
  normalizeZproBaseUrl,
  saveConnectionToken,
} from "@/lib/whatsapp/connection-config";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  provider: z.enum([
    "uazapi",
    "baileys",
    "evolution",
    "evolution_go",
    "zpro",
  ]),
  endpointUrl: z.string().trim().url().or(z.literal("")),
  instanceName: z.string().trim().max(120),
  apiToken: z.string().trim().max(2000).optional(),
  active: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Revise a conexão." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const { data: current, error: currentError } = await supabase
    .from("whatsapp_connections")
    .select("id,provider,endpoint_url,instance_name")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (currentError || !current) {
    return NextResponse.json(
      { error: "Conexão não encontrada." },
      { status: 404 },
    );
  }

  let tokenIds: Set<string>;
  try {
    tokenIds = await getConnectionTokens([id]);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar as credenciais da conexão." },
      { status: 500 },
    );
  }
  const hasToken = tokenIds.has(id) || Boolean(parsed.data.apiToken);
  const apiId =
    parsed.data.instanceName ||
    (current.provider === "zpro" ? current.instance_name : "") ||
    "";
  let endpointUrl = parsed.data.endpointUrl || null;

  if (parsed.data.provider === "zpro") {
    if (!endpointUrl || !apiId || !hasToken) {
      return NextResponse.json(
        { error: "Informe BaseUrl, ApiID e token da ZPRO." },
        { status: 400 },
      );
    }
    try {
      endpointUrl = normalizeZproBaseUrl(endpointUrl);
    } catch (baseUrlError) {
      return NextResponse.json(
        {
          error:
            baseUrlError instanceof Error
              ? baseUrlError.message
              : "BaseUrl da ZPRO inválida.",
        },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase
    .from("whatsapp_connections")
    .update({
      name: parsed.data.name,
      provider: parsed.data.provider,
      endpoint_url: endpointUrl,
      instance_name:
        parsed.data.provider === "zpro" ? apiId : parsed.data.instanceName || null,
      api_token: null,
      active: parsed.data.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json(
      { error: "Conexão não encontrada." },
      { status: 404 },
    );
  }

  if (parsed.data.apiToken) {
    try {
      await saveConnectionToken(id, parsed.data.apiToken);
    } catch (tokenError) {
      return NextResponse.json(
        {
          error:
            tokenError instanceof Error
              ? tokenError.message
              : "Não foi possível proteger o token.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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
  const { error } = await supabase
    .from("whatsapp_connections")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível excluir a conexão." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
