import { NextResponse } from "next/server";
import { z } from "zod";

import { matchesAudience } from "@/lib/audience";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().or(z.literal("")),
  kind: z.enum(["Cliente", "Licenciado"]),
  interest: z.string().trim().min(2).max(180),
  origin: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1000).optional().default(""),
  tagIds: z.array(z.string().uuid()).max(100).optional().default([]),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise os dados do contato." }, { status: 400 });
  const tagIds = [...new Set(parsed.data.tagIds)];
  if (tagIds.length) {
    const { data: ownedTags, error: tagsError } = await supabase.from("tags").select("id").eq("user_id", user.id).in("id", tagIds);
    if (tagsError) return NextResponse.json({ error: "Não foi possível validar as tags." }, { status: 500 });
    if ((ownedTags || []).length !== tagIds.length) return NextResponse.json({ error: "Uma ou mais tags não pertencem à sua conta." }, { status: 400 });
  }

  const { data: contact, error } = await supabase.from("contacts").insert({
    owner_id: user.id,
    name: parsed.data.name,
    phone: parsed.data.phone,
    kind: parsed.data.kind,
    interest: parsed.data.interest,
    origin: parsed.data.origin,
    note: parsed.data.note,
    email: parsed.data.email || null,
    status: "Novo",
    consent_at: new Date().toISOString(),
  }).select("id,created_at").single();
  if (error || !contact) return NextResponse.json({ error: "Não foi possível cadastrar o contato." }, { status: 500 });
  if (tagIds.length) {
    const { error: tagLinkError } = await supabase.from("contact_tags").insert(tagIds.map((tagId) => ({ user_id: user.id, contact_id: contact.id, tag_id: tagId })));
    if (tagLinkError) return NextResponse.json({ error: "O contato foi criado, mas não foi possível aplicar as tags." }, { status: 500 });
  }

  const { data: sequences } = await supabase.from("sequences").select("id,audience").eq("owner_id", user.id).eq("active", true).order("created_at", { ascending: true });
  const sequenceIds = (sequences || []).map((sequence) => sequence.id);
  const [tagTargetsResult, contactTargetsResult] = sequenceIds.length ? await Promise.all([
    supabase.from("sequence_tag_targets").select("sequence_id,tag_id").eq("user_id", user.id).in("sequence_id", sequenceIds),
    supabase.from("sequence_contact_targets").select("sequence_id,contact_id").eq("user_id", user.id).in("sequence_id", sequenceIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const sequence = !tagTargetsResult.error && !contactTargetsResult.error ? sequences?.find((item) => {
    if (!matchesAudience(item.audience, parsed.data.kind)) return false;
    const sequenceTagIds = (tagTargetsResult.data || []).filter((target) => target.sequence_id === item.id).map((target) => target.tag_id);
    const hasDirectTargets = (contactTargetsResult.data || []).some((target) => target.sequence_id === item.id);
    const hasAdditionalTargets = sequenceTagIds.length > 0 || hasDirectTargets;
    return !hasAdditionalTargets || sequenceTagIds.some((tagId) => tagIds.includes(tagId));
  }) : undefined;
  if (sequence) {
    const { data: firstStep } = await supabase.from("sequence_steps").select("delay_days").eq("sequence_id", sequence.id).eq("enabled", true).order("position").limit(1).maybeSingle();
    if (firstStep) {
      const nextRunAt = new Date(contact.created_at);
      nextRunAt.setDate(nextRunAt.getDate() + firstStep.delay_days);
      await supabase.from("contact_sequences").insert({ contact_id: contact.id, sequence_id: sequence.id, current_step: 0, next_run_at: nextRunAt.toISOString() });
    }
  }

  return NextResponse.json({ ok: true, id: contact.id, tagIds });
}
