import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const assignmentSchema = z.object({ tagIds: z.array(z.string().uuid()).max(100) });

async function getOwnedContact(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, contactId: string, userId: string) {
  return supabase.from("contacts").select("id").eq("id", contactId).eq("owner_id", userId).maybeSingle();
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return NextResponse.json({ error: "Contato inválido." }, { status: 400 });
  const { data: contact } = await getOwnedContact(supabase, id.data, user.id);
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const { data: links, error } = await supabase.from("contact_tags").select("tag_id").eq("user_id", user.id).eq("contact_id", id.data);
  if (error) return NextResponse.json({ error: "Não foi possível carregar as tags do contato." }, { status: 500 });
  const tagIds = (links || []).map((link) => link.tag_id);
  if (!tagIds.length) return NextResponse.json({ tags: [], tagIds: [] });
  const { data: tags, error: tagsError } = await supabase.from("tags").select("id,name,color").eq("user_id", user.id).in("id", tagIds).order("name");
  if (tagsError) return NextResponse.json({ error: "Não foi possível carregar as tags do contato." }, { status: 500 });
  return NextResponse.json({ tags: tags || [], tagIds });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = idSchema.safeParse(rawId);
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Seleção de tags inválida." }, { status: 400 });
  const tagIds = [...new Set(parsed.data.tagIds)];
  const { data: contact } = await getOwnedContact(supabase, id.data, user.id);
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  if (tagIds.length) {
    const { data: ownedTags, error } = await supabase.from("tags").select("id").eq("user_id", user.id).in("id", tagIds);
    if (error) return NextResponse.json({ error: "Não foi possível validar as tags." }, { status: 500 });
    if ((ownedTags || []).length !== tagIds.length) return NextResponse.json({ error: "Uma ou mais tags não pertencem à sua conta." }, { status: 400 });
  }

  const { error: deleteError } = await supabase.from("contact_tags").delete().eq("user_id", user.id).eq("contact_id", id.data);
  if (deleteError) return NextResponse.json({ error: "Não foi possível atualizar as tags do contato." }, { status: 500 });
  if (tagIds.length) {
    const { error: insertError } = await supabase.from("contact_tags").insert(tagIds.map((tagId) => ({ user_id: user.id, contact_id: id.data, tag_id: tagId })));
    if (insertError) return NextResponse.json({ error: "Não foi possível aplicar todas as tags." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tagIds });
}
