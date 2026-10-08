import { NextResponse } from "next/server";
import { z } from "zod";

import { sequenceAudiences } from "@/lib/audience";
import { renderMessageTemplate, type MessageContact } from "@/lib/message-variables";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from "@/lib/whatsapp";

const previewSchema = z.object({
  quickMessageId: z.string().uuid(),
  audience: z.enum(sequenceAudiences),
  tagIds: z.array(z.string().uuid()).max(100).default([]),
  contactIds: z.array(z.string().uuid()).max(2000).default([]),
  limit: z.number().int().min(1).max(2000),
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
    .select("id,title,body")
    .eq("id", parsed.data.quickMessageId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (messageError) return NextResponse.json({ error: "Não foi possível carregar a mensagem rápida." }, { status: 500 });
  if (!quickMessage) return NextResponse.json({ error: "Mensagem rápida não encontrada." }, { status: 404 });

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
      .select("id,name,phone,email,kind,interest,origin,status,note")
      .eq("owner_id", user.id)
      .in("id", resolvedIds)
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: "Não foi possível carregar os destinatários." }, { status: 500 });
    contacts = (data ?? []) as ResolvedContact[];
  }

  const withoutWhatsApp = contacts.filter((contact) => !normalizeWhatsAppPhone(contact.phone));
  const eligible = contacts.filter((contact) => normalizeWhatsAppPhone(contact.phone));
  const selected = eligible.slice(0, parsed.data.limit);
  const overLimit = eligible.slice(parsed.data.limit);

  const recipients = selected.map((contact) => {
    const rendered = renderMessageTemplate(quickMessage.body, toMessageContact(contact));
    return {
      contactId: contact.id,
      contactName: contact.name,
      phone: contact.phone,
      body: rendered.text,
      whatsappUrl: buildWhatsAppUrl(contact.phone, rendered.text),
      unknownVariables: rendered.unknownVariables,
    };
  });

  return NextResponse.json({
    message: { id: quickMessage.id, title: quickMessage.title },
    matchedCount: contacts.length,
    recipientCount: recipients.length,
    recipients,
    excluded: [
      ...withoutWhatsApp.map((contact) => ({ contactId: contact.id, contactName: contact.name, reason: "Sem WhatsApp" })),
      ...overLimit.map((contact) => ({ contactId: contact.id, contactName: contact.name, reason: "Fora do limite deste envio" })),
    ],
  });
}
