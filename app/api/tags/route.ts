import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const tagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const [tagsResult, linksResult] = await Promise.all([
    supabase.from("tags").select("id,name,color,created_at,updated_at").eq("user_id", user.id).order("name"),
    supabase.from("contact_tags").select("tag_id").eq("user_id", user.id),
  ]);
  const error = tagsResult.error || linksResult.error;
  if (error) return NextResponse.json({ error: "Não foi possível carregar as tags." }, { status: 500 });

  const counts = new Map<string, number>();
  for (const link of linksResult.data || []) counts.set(link.tag_id, (counts.get(link.tag_id) || 0) + 1);
  return NextResponse.json({
    tags: (tagsResult.data || []).map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      contactCount: counts.get(tag.id) || 0,
      createdAt: tag.created_at,
      updatedAt: tag.updated_at,
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = tagSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe um nome e uma cor hexadecimal válida." }, { status: 400 });

  const { data, error } = await supabase.from("tags").insert({
    user_id: user.id,
    name: parsed.data.name,
    color: parsed.data.color || null,
  }).select("id,name,color,created_at,updated_at").single();
  if (error?.code === "23505") return NextResponse.json({ error: "Você já possui uma tag com esse nome." }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: "Não foi possível criar a tag." }, { status: 500 });
  return NextResponse.json({ tag: { id: data.id, name: data.name, color: data.color, contactCount: 0, createdAt: data.created_at, updatedAt: data.updated_at } }, { status: 201 });
}
