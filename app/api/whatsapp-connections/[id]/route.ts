import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getConnectionTokens,
  saveConnectionToken,
} from "@/lib/whatsapp/connection-config";
import { parseZproConnectionAddress } from "@/lib/whatsapp/zpro-connection";

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
  channelId: z.string().trim().max(20).default(""),
  active: z.boolean(),
  dailyLimit: z.number().int().min(1).max(10000),
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
  let apiId = parsed.data.instanceName || "";
  let endpointUrl = parsed.data.endpointUrl || null;
  let channelId: number | null = null;

  if (parsed.data.provider === "zpro") {
    if (
      !/^[1-9]\d*$/.test(parsed.data.channelId) ||
      !Number.isSafeInteger(Number(parsed.data.channelId))
    ) {
      return NextResponse.json(
        { error: "Informe um ID de canal inteiro e positivo." },
        { status: 400 },
      );
    }
    channelId = Number(parsed.data.channelId);
    endpointUrl =
      endpointUrl ||
      (current.provider === "zpro" ? current.endpoint_url : null);
    if (!endpointUrl || !hasToken) {
      return NextResponse.json(
        { error: "Informe a URL do backend, o ApiID e o token da ZPRO." },
        { status: 400 },
      );
    }
    try {
      const address = parseZproConnectionAddress(endpointUrl, apiId);
      endpointUrl = address.baseUrl;
      apiId =
        address.apiId ||
        (current.provider === "zpro" ? current.instance_name : "") ||
        "";
      if (!apiId) {
        return NextResponse.json(
          { error: "Informe o ApiID da ZPRO ou cole o endpoint completo." },
          { status: 400 },
        );
      }
    } catch (baseUrlError) {
      return NextResponse.json(
        {
          error:
            baseUrlError instanceof Error
              ? baseUrlError.message
              : "URL do backend da ZPRO inválida.",
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
      channel_number: null,
      channel_id: channelId,
      active: parsed.data.active,
      daily_limit: parsed.data.dailyLimit,
      health_status: "unknown",
      health_error: null,
      health_checked_at: null,
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
