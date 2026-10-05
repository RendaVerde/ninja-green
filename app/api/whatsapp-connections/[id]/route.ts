import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const updateSchema = z.object({ name: z.string().trim().min(2).max(100), provider: z.enum(["uazapi", "baileys", "evolution", "evolution_go", "zpro"]), endpointUrl: z.string().trim().url().or(z.literal("")), instanceName: z.string().trim().max(120), apiToken: z.string().trim().max(1000).optional(), active: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.provider === "zpro" && !parsed.data.endpointUrl)) return NextResponse.json({ error: "Revise os dados da conexão." }, { status: 400 });
  const { id } = await context.params;
  const payload: Record<string, unknown> = { name: parsed.data.name, provider: parsed.data.provider, endpoint_url: parsed.data.endpointUrl || null, instance_name: parsed.data.instanceName || null, active: parsed.data.active, updated_at: new Date().toISOString() };
  if (parsed.data.apiToken) payload.api_token = parsed.data.apiToken;
  const { data, error } = await supabase.from("whatsapp_connections").update(payload).eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Conexão não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabase.from("whatsapp_connections").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível excluir a conexão." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
