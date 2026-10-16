import { NextResponse } from "next/server";
import { z } from "zod";

import { sequenceAudiences } from "@/lib/audience";
import { signMessageAttachments } from "@/lib/message-attachment-links";
import { appendAttachmentLinks, type MessageAttachment } from "@/lib/message-attachments";
import { renderMessageTemplate, type MessageContact } from "@/lib/message-variables";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from "@/lib/whatsapp";

const previewSchema = z.object({
  quickMessageId: z.string().uuid(),
  audience: z.enum(sequenceAudiences),
  tagIds: z.array(z.string().uuid()).max(100).default([]),
  contactIds: z.array(z.string().uuid()).max(2000).default([]),
  limit: z.number().int().min(1).max(2000),
  connectionId: z.string().uuid().nullable().optional(),
});

type ResolvedContact = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  kind: "Cliente" | "Licenciado";
  interest: string;
  origin: string;
  status: MessageContact["status"];
  note: string | null;
  do_not_contact: boolean;
};

function toMessageContact(contact: ResolvedContact): MessageContact {
  return {
    name: contact.name,
    phone: contact.phone,
    email: contact.email ?? "",
    kind: contact.kind,
    interest: contact.interest,
    origin: contact.origin,
    status: contact.status,
    note: contact.note ?? "",
  };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Configuração de envio inválida." }, { status: 400 });

  const { data: quickMessage, error: messageError } = await supabase
    .from("quick_messages")
    .select("id,title,body,attachments")
    .eq("id", parsed.data.quickMessageId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (messageError) return NextResponse.json({ error: "Não foi possível carregar a mensagem rápida." }, { status: 500 });
  if (!quickMessage) return NextResponse.json({ error: "Mensagem rápida não encontrada." }, { status: 404 });

  const { data: zproConnections, error: connectionError } = await supabase
    .from("whatsapp_connections")
    .select("id,name,health_status")
    .eq("owner_id", user.id)
    .eq("provider", "zpro")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (connectionError) {
    return NextResponse.json(
      { error: "Não foi possível verificar o modo de envio." },
      { status: 500 },
    );
  }
  const requestedConnection = parsed.data.connectionId
    ? (zproConnections || []).find(
        (connection) => connection.id === parsed.data.connectionId,
      )
    : null;
  if (parsed.data.connectionId && !requestedConnection) {
    return NextResponse.json(
      { error: "A conexão selecionada não está disponível." },
      { status: 400 },
    );
  }
  const zproConnection =
    requestedConnection ||
    ((zproConnections || []).length === 1 ? zproConnections![0] : null);
  if ((zproConnections || []).length > 1 && !zproConnection) {
    return NextResponse.json(
      { error: "Escolha qual conexão WhatsApp deve realizar o envio." },
      { status: 409 },
    );
  }
  if (zproConnection?.health_status === "error") {
    return NextResponse.json(
      { error: "A conexão selecionada está com erro. Teste ou corrija a conexão antes de enviar." },
      { status: 409 },
    );
  }

  let signedAttachments;
  try {
    signedAttachments = await signMessageAttachments(supabase, user.id, (quickMessage.attachments || []) as MessageAttachment[]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível preparar os anexos." }, { status: 500 });
  }

  const { data: resolvedRows, error: audienceError } = await supabase.rpc("resolve_contact_audience", {
    target_audience: parsed.data.audience,
    target_tag_ids: [...new Set(parsed.data.tagIds)],
    target_contact_ids: [...new Set(parsed.data.contactIds)],
  });
  if (audienceError) return NextResponse.json({ error: "Não foi possível resolver os destinatários." }, { status: 400 });

  const resolvedIds = ((resolvedRows ?? []) as Array<{ contact_id: string }>).map((row) => row.contact_id);
  let contacts: ResolvedContact[] = [];
  if (resolvedIds.length > 0) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id,name,phone,email,kind,interest,origin,status,note,do_not_contact")
      .eq("owner_id", user.id)
      .in("id", resolvedIds)
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: "Não foi possível carregar os destinatários." }, { status: 500 });
    contacts = (data ?? []) as ResolvedContact[];
  }

  const doNotContact = contacts.filter((contact) => contact.do_not_contact);
  const withoutWhatsApp = contacts.filter((contact) => !contact.do_not_contact && !normalizeWhatsAppPhone(contact.phone));
  const eligible = contacts.filter((contact) => !contact.do_not_contact && normalizeWhatsAppPhone(contact.phone));
  const selected = eligible.slice(0, parsed.data.limit);
  const overLimit = eligible.slice(parsed.data.limit);

  const recipients = selected.map((contact) => {
    const rendered = renderMessageTemplate(quickMessage.body, toMessageContact(contact));
    const manualBody = appendAttachmentLinks(rendered.text, signedAttachments);
    return {
      messageId: crypto.randomUUID(),
      contactId: contact.id,
      contactName: contact.name,
      phone: contact.phone,
      body: rendered.text,
      whatsappUrl: buildWhatsAppUrl(
        contact.phone,
        zproConnection && !(quickMessage.attachments || []).length
          ? rendered.text
          : manualBody,
      ),
      unknownVariables: rendered.unknownVariables,
      attachments: (quickMessage.attachments || []) as MessageAttachment[],
    };
  });

  return NextResponse.json({
    deliveryMode:
      zproConnection && !(quickMessage.attachments || []).length
        ? "provider"
        : "manual",
    connectionId: zproConnection?.id || null,
    message: { id: quickMessage.id, title: quickMessage.title },
    matchedCount: contacts.length,
    recipientCount: recipients.length,
    recipients,
    excluded: [
      ...doNotContact.map((contact) => ({ contactId: contact.id, contactName: contact.name, reason: "Não contatar" })),
      ...withoutWhatsApp.map((contact) => ({ contactId: contact.id, contactName: contact.name, reason: "Sem WhatsApp" })),
      ...overLimit.map((contact) => ({ contactId: contact.id, contactName: contact.name, reason: "Fora do limite deste envio" })),
    ],
  });
}
