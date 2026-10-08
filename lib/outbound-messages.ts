import type { SupabaseClient } from "@supabase/supabase-js";

export class OutboundMessageError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "OutboundMessageError";
  }
}

type RecordOutboundMessageInput = {
  supabase: SupabaseClient;
  userId: string;
  contactId: string;
  body: string;
};

export async function recordOutboundMessage({ supabase, userId, contactId, body }: RecordOutboundMessageInput) {
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,created_at")
    .eq("id", contactId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (contactError) throw new OutboundMessageError("Não foi possível localizar o contato.", 500);
  if (!contact) throw new OutboundMessageError("Contato não encontrado.", 404);

  const { error: messageError } = await supabase.from("messages").insert({
    owner_id: userId,
    contact_id: contact.id,
    channel: "whatsapp",
    provider: "manual",
    direction: "outbound",
    body,
    status: "opened",
  });
  if (messageError) throw new OutboundMessageError("Não foi possível registrar a atividade.", 500);

  await supabase
    .from("contacts")
    .update({ status: "Em contato", updated_at: new Date().toISOString() })
    .eq("id", contact.id)
    .eq("owner_id", userId)
    .eq("status", "Novo");

  return contact as { id: string; created_at: string };
}
