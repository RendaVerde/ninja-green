import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const duplicateSchema = z.object({ name: z.string().trim().min(2).max(120).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = idSchema.safeParse(rawId);
  const parsed = duplicateSchema.safeParse(await request.json().catch(() => ({})));
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Duplicação inválida." }, { status: 400 });

  const { data: source, error: sourceError } = await supabase.from("sequences").select("id,name").eq("id", id.data).eq("owner_id", user.id).maybeSingle();
  if (sourceError) return NextResponse.json({ error: "Não foi possível localizar a cadência." }, { status: 500 });
  if (!source) return NextResponse.json({ error: "Cadência não encontrada." }, { status: 404 });
  const name = parsed.data.name || `${source.name} (cópia)`.slice(0, 120);
  const { data: newId, error } = await supabase.rpc("duplicate_sequence", { target_sequence_id: source.id, duplicate_name: name });
  if (error || !newId) return NextResponse.json({ error: "Não foi possível duplicar a cadência." }, { status: 500 });
  return NextResponse.json({ ok: true, id: newId }, { status: 201 });
}
