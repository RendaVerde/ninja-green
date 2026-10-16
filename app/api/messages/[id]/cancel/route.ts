import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("messages")
    .update({
      queue_status: "canceled",
      status: "failed",
      canceled_at: now,
      cancel_reason: "canceled_by_user",
    })
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("queue_status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível cancelar a mensagem." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "A mensagem não está mais pendente." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
