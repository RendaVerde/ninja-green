import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const tagPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
}).refine((value) => value.name !== undefined || value.color !== undefined);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = idSchema.safeParse(rawId);
  const parsed = tagPatchSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Alteração de tag inválida." }, { status: 400 });

  const payload = {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.color !== undefined ? { color: parsed.data.color || null } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("tags").update(payload).eq("id", id.data).eq("user_id", user.id).select("id,name,color,created_at,updated_at").maybeSingle();
  if (error?.code === "23505") return NextResponse.json({ error: "Você já possui uma tag com esse nome." }, { status: 409 });
  if (error) return NextResponse.json({ error: "Não foi possível atualizar a tag." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Tag não encontrada." }, { status: 404 });
  return NextResponse.json({ tag: { id: data.id, name: data.name, color: data.color, createdAt: data.created_at, updatedAt: data.updated_at } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return NextResponse.json({ error: "Tag inválida." }, { status: 400 });

  const { data, error } = await supabase.from("tags").delete().eq("id", id.data).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível excluir a tag." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Tag não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
