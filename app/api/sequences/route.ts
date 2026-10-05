import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const sequenceSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  audience: z.enum(["Todos os contatos", "Somente clientes", "Somente licenciados"]),
  pauseOnReply: z.boolean(),
  steps: z.array(z.object({
    id: z.string().min(1),
    delayDays: z.number().int().min(0).max(365),
    title: z.string().trim().min(2).max(120),
    message: z.string().trim().min(2).max(2000),
    enabled: z.boolean(),
  })).min(1).max(30),
});

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = sequenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise a cadência antes de salvar." }, { status: 400 });

  let sequenceId = parsed.data.id || null;
  if (sequenceId) {
    const { data, error } = await supabase.from("sequences").update({ name: parsed.data.name, audience: parsed.data.audience, pause_on_reply: parsed.data.pauseOnReply, updated_at: new Date().toISOString() }).eq("id", sequenceId).eq("owner_id", user.id).select("id").maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Cadência não encontrada." }, { status: 404 });
  } else {
    const { data, error } = await supabase.from("sequences").insert({ owner_id: user.id, name: parsed.data.name, audience: parsed.data.audience, pause_on_reply: parsed.data.pauseOnReply, active: true }).select("id").single();
    if (error || !data) return NextResponse.json({ error: "Não foi possível criar a cadência." }, { status: 500 });
    sequenceId = data.id;
  }

  const { error: deleteError } = await supabase.from("sequence_steps").delete().eq("sequence_id", sequenceId);
  if (deleteError) return NextResponse.json({ error: "Não foi possível atualizar as etapas." }, { status: 500 });
  const { error: insertError } = await supabase.from("sequence_steps").insert(parsed.data.steps.map((step, position) => ({
    sequence_id: sequenceId,
    position,
    delay_days: step.delayDays,
    title: step.title,
    message_template: step.message,
    enabled: step.enabled,
  })));
  if (insertError) return NextResponse.json({ error: "Não foi possível salvar as etapas." }, { status: 500 });
  return NextResponse.json({ ok: true, id: sequenceId });
}
