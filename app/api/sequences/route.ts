import { NextResponse } from "next/server";
import { z } from "zod";

import { sequenceAudiences } from "@/lib/audience";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sequenceSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  audience: z.enum(sequenceAudiences),
  pauseOnReply: z.boolean(),
  active: z.boolean().optional(),
  steps: z.array(z.object({
    id: z.string().min(1),
    delayDays: z.number().int().min(0).max(365),
    title: z.string().trim().min(2).max(120),
    message: z.string().trim().min(2).max(2000),
    enabled: z.boolean(),
  })).min(1).max(30),
});

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { data: sequences, error } = await supabase.from("sequences")
    .select("id,name,audience,pause_on_reply,active,created_at,updated_at")
    .eq("owner_id", user.id)
    .order("created_at");
  if (error) return NextResponse.json({ error: "Não foi possível carregar as cadências." }, { status: 500 });
  if (!sequences?.length) return NextResponse.json({ sequences: [] });
  const sequenceIds = sequences.map((sequence) => sequence.id);

  const [stepsResult, tagTargetsResult, contactTargetsResult] = await Promise.all([
    supabase.from("sequence_steps").select("id,sequence_id,delay_days,title,message_template,enabled,position").in("sequence_id", sequenceIds).order("position"),
    supabase.from("sequence_tag_targets").select("sequence_id,tag_id").eq("user_id", user.id).in("sequence_id", sequenceIds),
    supabase.from("sequence_contact_targets").select("sequence_id,contact_id").eq("user_id", user.id).in("sequence_id", sequenceIds),
  ]);
  const childError = stepsResult.error || tagTargetsResult.error || contactTargetsResult.error;
  if (childError) return NextResponse.json({ error: "Não foi possível carregar os detalhes das cadências." }, { status: 500 });

  return NextResponse.json({
    sequences: sequences.map((sequence) => ({
      id: sequence.id,
      name: sequence.name,
      audience: sequence.audience,
      pauseOnReply: sequence.pause_on_reply,
      active: sequence.active,
      createdAt: sequence.created_at,
      updatedAt: sequence.updated_at,
      tagIds: (tagTargetsResult.data || []).filter((target) => target.sequence_id === sequence.id).map((target) => target.tag_id),
      contactIds: (contactTargetsResult.data || []).filter((target) => target.sequence_id === sequence.id).map((target) => target.contact_id),
      steps: (stepsResult.data || []).filter((step) => step.sequence_id === sequence.id).map((step) => ({
        id: step.id,
        delayDays: step.delay_days,
        title: step.title,
        message: step.message_template,
        enabled: step.enabled,
      })),
    })),
  });
}

async function saveSequence(request: Request, createOnly: boolean) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = sequenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (createOnly && parsed.data.id)) return NextResponse.json({ error: "Revise a cadência antes de salvar." }, { status: 400 });

  let sequenceId = createOnly ? null : parsed.data.id || null;
  if (sequenceId) {
    const update = {
      name: parsed.data.name,
      audience: parsed.data.audience,
      pause_on_reply: parsed.data.pauseOnReply,
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("sequences").update(update).eq("id", sequenceId).eq("owner_id", user.id).select("id").maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Cadência não encontrada." }, { status: 404 });
  } else {
    const { data, error } = await supabase.from("sequences").insert({
      owner_id: user.id,
      name: parsed.data.name,
      audience: parsed.data.audience,
      pause_on_reply: parsed.data.pauseOnReply,
      active: parsed.data.active ?? true,
    }).select("id").single();
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
  return NextResponse.json({ ok: true, id: sequenceId }, { status: createOnly ? 201 : 200 });
}

export async function POST(request: Request) {
  return saveSequence(request, true);
}

export async function PUT(request: Request) {
  return saveSequence(request, false);
}
