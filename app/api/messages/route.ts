import { NextResponse } from "next/server";
import { z } from "zod";

import { OutboundMessageError, recordOutboundMessage } from "@/lib/outbound-messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const messageSchema = z.object({ contactId: z.string().uuid(), body: z.string().trim().min(1).max(4000) });

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  let contact: { id: string; created_at: string };
  try {
    contact = await recordOutboundMessage({ supabase, userId: user.id, contactId: parsed.data.contactId, body: parsed.data.body });
  } catch (error) {
    if (error instanceof OutboundMessageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Não foi possível registrar a atividade." }, { status: 500 });
  }

  const { data: link } = await supabase.from("contact_sequences").select("id,sequence_id,current_step").eq("contact_id", contact.id).is("paused_at", null).is("completed_at", null).maybeSingle();
  if (link) {
    const { data: steps } = await supabase.from("sequence_steps").select("delay_days").eq("sequence_id", link.sequence_id).eq("enabled", true).order("position");
    const nextIndex = link.current_step + 1;
    const nextStep = steps?.[nextIndex];
    if (nextStep) {
      const nextRunAt = new Date(contact.created_at);
      nextRunAt.setDate(nextRunAt.getDate() + nextStep.delay_days);
      await supabase.from("contact_sequences").update({ current_step: nextIndex, next_run_at: nextRunAt.toISOString() }).eq("id", link.id);
    } else {
      await supabase.from("contact_sequences").update({ completed_at: new Date().toISOString(), next_run_at: null }).eq("id", link.id);
    }
  }
  return NextResponse.json({ ok: true });
}
