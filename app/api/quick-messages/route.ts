import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const quickMessageSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { data, error } = await supabase
    .from("quick_messages")
    .select("id,title,body,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Não foi possível carregar as mensagens rápidas." }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const parsed = quickMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Preencha o título e a mensagem corretamente." }, { status: 400 });

  const { data, error } = await supabase
    .from("quick_messages")
    .insert({ user_id: user.id, title: parsed.data.title, body: parsed.data.body })
    .select("id,title,body,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ error: "Não foi possível criar a mensagem rápida." }, { status: 500 });
  return NextResponse.json({ message: data }, { status: 201 });
}
