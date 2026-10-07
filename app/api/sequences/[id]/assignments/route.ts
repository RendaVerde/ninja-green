import { NextResponse } from "next/server";
import { z } from "zod";

import { AudienceAssignmentResult, sequenceAudiences } from "@/lib/audience";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const assignmentSchema = z.object({
  audience: z.enum(sequenceAudiences),
  tagIds: z.array(z.string().uuid()).max(100).default([]),
  contactIds: z.array(z.string().uuid()).max(2000).default([]),
  confirmMove: z.boolean().default(false),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = idSchema.safeParse(rawId);
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Configuração de público inválida." }, { status: 400 });

  const { data: sequence, error: sequenceError } = await supabase.from("sequences").select("id").eq("id", id.data).eq("owner_id", user.id).maybeSingle();
  if (sequenceError) return NextResponse.json({ error: "Não foi possível localizar a cadência." }, { status: 500 });
  if (!sequence) return NextResponse.json({ error: "Cadência não encontrada." }, { status: 404 });

  const { data, error } = await supabase.rpc("configure_sequence_audience", {
    target_sequence_id: sequence.id,
    target_audience: parsed.data.audience,
    target_tag_ids: [...new Set(parsed.data.tagIds)],
    target_contact_ids: [...new Set(parsed.data.contactIds)],
    confirm_move: parsed.data.confirmMove,
  });
  if (error || !data) return NextResponse.json({ error: "Não foi possível atualizar o público da cadência." }, { status: 500 });
  const result = data as AudienceAssignmentResult;
  if (result.status === "conflict") {
    return NextResponse.json({
      error: "Alguns contatos já participam de outra sequência ativa.",
      ...result,
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...result });
}
