import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  status: z.enum(["Novo", "Em contato", "Respondeu", "Qualificado"]).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  interest: z.string().trim().min(2).max(180).optional(),
  origin: z.string().trim().min(2).max(120).optional(),
  note: z.string().trim().max(1000).optional(),
  doNotContact: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Alteração inválida." }, { status: 400 });
  const { id } = await context.params;
  const { doNotContact, ...contactFields } = parsed.data;
  const payload = {
    ...contactFields,
    ...(doNotContact !== undefined ? { do_not_contact: doNotContact } : {}),
    email: parsed.data.email === "" ? null : parsed.data.email,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("contacts").update(payload).eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível atualizar o contato." }, { status: 500 });
  if (doNotContact) {
    const now = new Date().toISOString();
    await Promise.all([
      supabase
        .from("messages")
        .update({
          queue_status: "canceled",
          status: "failed",
          canceled_at: now,
          cancel_reason: "contact_do_not_contact",
        })
        .eq("owner_id", user.id)
        .eq("contact_id", id)
        .eq("queue_status", "pending"),
      supabase
        .from("contact_sequences")
        .update({
          paused_at: now,
          pause_reason: "Contato marcado como não contatar.",
          next_run_at: null,
        })
        .eq("contact_id", id)
        .is("paused_at", null)
        .is("completed_at", null),
    ]);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabase.from("contacts").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível excluir o contato." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
