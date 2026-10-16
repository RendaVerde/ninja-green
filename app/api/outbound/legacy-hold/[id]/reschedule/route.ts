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
    return NextResponse.json({ error: "Passivo inválido." }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("reschedule_legacy_sequence", {
    target_link_id: id,
  });
  if (error || !data) {
    return NextResponse.json(
      { error: "Não foi possível reagendar o passivo retido." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, scheduledAt: data });
}
