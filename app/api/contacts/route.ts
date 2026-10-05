import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().or(z.literal("")),
  kind: z.enum(["Cliente", "Licenciado"]),
  interest: z.string().trim().min(2).max(180),
  origin: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1000).optional().default(""),
});

function matchesAudience(audience: string, kind: "Cliente" | "Licenciado") {
  return audience === "Todos os contatos" || (audience === "Somente clientes" && kind === "Cliente") || (audience === "Somente licenciados" && kind === "Licenciado");
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise os dados do contato." }, { status: 400 });

  const { data: contact, error } = await supabase.from("contacts").insert({
    owner_id: user.id,
    ...parsed.data,
    email: parsed.data.email || null,
    status: "Novo",
    consent_at: new Date().toISOString(),
  }).select("id,created_at").single();
  if (error || !contact) return NextResponse.json({ error: "Não foi possível cadastrar o contato." }, { status: 500 });

  const { data: sequences } = await supabase.from("sequences").select("id,audience").eq("active", true).order("created_at", { ascending: true });
  const sequence = sequences?.find((item) => matchesAudience(item.audience, parsed.data.kind));
  if (sequence) {
    const { data: firstStep } = await supabase.from("sequence_steps").select("delay_days").eq("sequence_id", sequence.id).eq("enabled", true).order("position").limit(1).maybeSingle();
    if (firstStep) {
      const nextRunAt = new Date(contact.created_at);
      nextRunAt.setDate(nextRunAt.getDate() + firstStep.delay_days);
      await supabase.from("contact_sequences").insert({ contact_id: contact.id, sequence_id: sequence.id, current_step: 0, next_run_at: nextRunAt.toISOString() });
    }
  }

  return NextResponse.json({ ok: true, id: contact.id });
}
