import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  status: z.enum(["Novo", "Em contato", "Respondeu", "Qualificado"]).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  interest: z.string().trim().min(2).max(180).optional(),
  origin: z.string().trim().min(2).max(120).optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Alteração inválida." }, { status: 400 });
  const { id } = await context.params;
  const payload = { ...parsed.data, email: parsed.data.email === "" ? null : parsed.data.email, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("contacts").update(payload).eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível atualizar o contato." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabase.from("contacts").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível excluir o contato." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
