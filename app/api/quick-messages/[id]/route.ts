import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const updateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { id: rawId } = await context.params;
  const id = idSchema.safeParse(rawId);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Mensagem rápida inválida." }, { status: 400 });

  const { data, error } = await supabase
    .from("quick_messages")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .select("id,title,body,created_at,updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Não foi possível atualizar a mensagem rápida." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Mensagem rápida não encontrada." }, { status: 404 });
  return NextResponse.json({ message: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { id: rawId } = await context.params;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return NextResponse.json({ error: "Mensagem rápida inválida." }, { status: 400 });

  const { data, error } = await supabase
    .from("quick_messages")
    .delete()
    .eq("id", id.data)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Não foi possível excluir a mensagem rápida." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Mensagem rápida não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
