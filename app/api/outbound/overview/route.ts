import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { data: ownedSequences, error: sequencesError } = await supabase
    .from("sequences")
    .select("id,name")
    .eq("owner_id", user.id);
  if (sequencesError) {
    return NextResponse.json({ error: "Não foi possível carregar a operação de envios." }, { status: 500 });
  }
  const sequenceIds = (ownedSequences || []).map((sequence) => sequence.id);
  const [messagesResult, connectionsResult, legacyResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id,contact_id,connection_id,body,queue_status,source,attempt_count,scheduled_at,next_attempt_at,sent_at,created_at,provider_error_message,uncertainty_reason,retry_of,cancel_reason")
      .eq("owner_id", user.id)
      .not("queue_status", "is", null)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("whatsapp_connections")
      .select("id,name,active,daily_limit,health_status,health_error,health_checked_at,circuit_open_until,last_tested_at")
      .eq("owner_id", user.id)
      .eq("provider", "zpro")
      .order("created_at", { ascending: false }),
    sequenceIds.length
      ? supabase
          .from("contact_sequences")
          .select("id,contact_id,sequence_id,legacy_due_at")
          .in("sequence_id", sequenceIds)
          .eq("schedule_status", "legacy_hold")
          .is("completed_at", null)
          .order("legacy_due_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (messagesResult.error || connectionsResult.error || legacyResult.error) {
    return NextResponse.json({ error: "Não foi possível carregar a operação de envios." }, { status: 500 });
  }
  const contactIds = [...new Set([
    ...(messagesResult.data || []).map((message) => message.contact_id),
    ...(legacyResult.data || []).map((item) => item.contact_id),
  ])];
  const contactsResult = contactIds.length
    ? await supabase.from("contacts").select("id,name").eq("owner_id", user.id).in("id", contactIds)
    : { data: [], error: null };
  if (contactsResult.error) {
    return NextResponse.json({ error: "Não foi possível carregar a operação de envios." }, { status: 500 });
  }
  const contactNames = new Map((contactsResult.data || []).map((contact) => [contact.id, contact.name]));
  const connectionNames = new Map((connectionsResult.data || []).map((connection) => [connection.id, connection.name]));
  const sequenceNames = new Map((ownedSequences || []).map((sequence) => [sequence.id, sequence.name]));

  return NextResponse.json({
    messages: (messagesResult.data || []).map((message) => ({
      ...message,
      contacts: { name: contactNames.get(message.contact_id) || "Contato" },
      whatsapp_connections: message.connection_id
        ? { name: connectionNames.get(message.connection_id) || "Conexão removida" }
        : null,
    })),
    connections: connectionsResult.data || [],
    legacyHolds: (legacyResult.data || []).map((item) => ({
      ...item,
      contacts: { name: contactNames.get(item.contact_id) || "Contato" },
      sequences: { name: sequenceNames.get(item.sequence_id) || "Cadência" },
    })),
  });
}
