import { after, NextResponse } from "next/server";
import { z } from "zod";

import {
  advanceActiveSequence,
  dispatchOutboundBatch,
} from "@/lib/outbound-dispatcher";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 45;

const actionSchema = z.object({
  action: z.enum(["resend", "mark_sent"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const { id } = await context.params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }
  const { data: message, error } = await supabase
    .from("messages")
    .select("id,owner_id,contact_id,connection_id,body,source,priority")
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("queue_status", "unknown")
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível carregar a mensagem." },
      { status: 500 },
    );
  }
  if (!message) {
    return NextResponse.json(
      { error: "Esta mensagem não está mais com envio incerto." },
      { status: 409 },
    );
  }
  if (parsed.data.action === "mark_sent") {
    const sentAt = new Date().toISOString();
    const { data: updatedMessage, error: updateError } = await supabase
      .from("messages")
      .update({
        queue_status: "sent",
        status: "sent",
        provider: "zpro",
        provider_error_code: null,
        provider_error_message: null,
        uncertainty_reason: null,
        sent_at: sentAt,
      })
      .eq("id", message.id)
      .eq("owner_id", user.id)
      .eq("queue_status", "unknown")
      .select("id")
      .maybeSingle();
    if (updateError) {
      return NextResponse.json(
        { error: "Não foi possível confirmar a mensagem como enviada." },
        { status: 500 },
      );
    }
    if (!updatedMessage) {
      return NextResponse.json(
        { error: "Esta mensagem já foi resolvida." },
        { status: 409 },
      );
    }
    await supabase
      .from("contacts")
      .update({ status: "Em contato", updated_at: sentAt })
      .eq("id", message.contact_id)
      .eq("owner_id", user.id)
      .eq("status", "Novo");
    await advanceActiveSequence(supabase, {
      source: message.source,
      contactId: message.contact_id,
      ownerId: user.id,
    });
    return NextResponse.json({ ok: true });
  }

  const [{ data: contact }, { data: settings }, { data: connection }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id,do_not_contact")
        .eq("id", message.contact_id)
        .eq("owner_id", user.id)
        .maybeSingle(),
      supabase
        .from("outbound_settings")
        .select("pause_all")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("whatsapp_connections")
        .select("id")
        .eq("id", message.connection_id)
        .eq("owner_id", user.id)
        .eq("active", true)
        .neq("health_status", "error")
        .maybeSingle(),
    ]);
  if (!contact || contact.do_not_contact) {
    return NextResponse.json(
      { error: "Este contato está marcado como não contatar." },
      { status: 409 },
    );
  }
  if (settings?.pause_all) {
    return NextResponse.json(
      { error: "Todos os envios estão pausados." },
      { status: 409 },
    );
  }
  if (!connection) {
    return NextResponse.json(
      { error: "A conexão original não está disponível." },
      { status: 409 },
    );
  }
  const newMessageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const cancelReason = `resubmitted_as:${newMessageId}`;
  const { data: canceledMessage, error: cancelError } = await supabase
    .from("messages")
    .update({
      queue_status: "canceled",
      status: "failed",
      canceled_at: now,
      cancel_reason: cancelReason,
    })
    .eq("id", message.id)
    .eq("owner_id", user.id)
    .eq("queue_status", "unknown")
    .select("id")
    .maybeSingle();
  if (cancelError) {
    return NextResponse.json(
      { error: "Não foi possível reservar o reenvio." },
      { status: 500 },
    );
  }
  if (!canceledMessage) {
    return NextResponse.json(
      { error: "Esta mensagem já foi resolvida." },
      { status: 409 },
    );
  }
  const { error: insertError } = await supabase.from("messages").insert({
    id: newMessageId,
    owner_id: user.id,
    contact_id: message.contact_id,
    connection_id: connection.id,
    channel: "whatsapp",
    direction: "outbound",
    body: message.body,
    status: "queued",
    queue_status: "pending",
    source: message.source,
    retry_of: message.id,
    priority: message.priority,
    scheduled_at: now,
    confirmed_at: now,
  });
  if (insertError) {
    await supabase
      .from("messages")
      .update({
        queue_status: "unknown",
        canceled_at: null,
        cancel_reason: null,
      })
      .eq("id", message.id)
      .eq("owner_id", user.id)
      .eq("queue_status", "canceled")
      .eq("cancel_reason", cancelReason);
    return NextResponse.json(
      { error: "Não foi possível criar a nova tentativa." },
      { status: 500 },
    );
  }
  after(async () => {
    await dispatchOutboundBatch({ ownerId: user.id });
  });
  return NextResponse.json({
    ok: true,
    messageId: newMessageId,
    warning: "A mensagem original pode ter sido entregue; este reenvio usa uma nova chave.",
  });
}
