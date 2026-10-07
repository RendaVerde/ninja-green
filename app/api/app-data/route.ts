import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ContactRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  kind: "Cliente" | "Licenciado";
  interest: string;
  origin: string;
  status: "Novo" | "Em contato" | "Respondeu" | "Qualificado";
  note: string | null;
  created_at: string;
};

function formatMoment(value?: string | null) {
  if (!value) return "Não agendado";
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  if (sameDay) return `${date <= now ? "Atrasado" : "Hoje"}, ${time}`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });
}

function formatRelative(value?: string | null) {
  if (!value) return "Ainda não contatada";
  const date = new Date(value);
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const [contactsResult, sequencesResult, linksResult, messagesResult, tagsResult, contactTagsResult] = await Promise.all([
    supabase.from("contacts").select("id,name,phone,email,kind,interest,origin,status,note,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }),
    supabase.from("sequences").select("id,name,audience,pause_on_reply,active,created_at,updated_at").eq("owner_id", user.id).order("created_at", { ascending: true }),
    supabase.from("contact_sequences").select("contact_id,next_run_at,paused_at,completed_at").is("completed_at", null),
    supabase.from("messages").select("id,contact_id,direction,body,status,sent_at,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("tags").select("id,name,color,created_at,updated_at").eq("user_id", user.id).order("name"),
    supabase.from("contact_tags").select("contact_id,tag_id").eq("user_id", user.id),
  ]);

  const queryError = contactsResult.error || sequencesResult.error || linksResult.error || messagesResult.error || tagsResult.error || contactTagsResult.error;
  if (queryError) return NextResponse.json({ error: "Não foi possível carregar seus dados." }, { status: 500 });

  const links = linksResult.data || [];
  const messages = messagesResult.data || [];
  const contacts = ((contactsResult.data || []) as ContactRow[]).map((contact) => {
    const link = links.find((item) => item.contact_id === contact.id && !item.paused_at);
    const contactMessages = messages.filter((item) => item.contact_id === contact.id);
    const latestMessage = contactMessages[0];
    return {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email || "",
      kind: contact.kind,
      interest: contact.interest,
      origin: contact.origin,
      status: contact.status,
      note: contact.note || "",
      tagIds: (contactTagsResult.data || []).filter((link) => link.contact_id === contact.id).map((link) => link.tag_id),
      nextRunAt: link?.next_run_at || null,
      lastContactAt: latestMessage?.sent_at || latestMessage?.created_at || null,
      nextContact: formatMoment(link?.next_run_at),
      lastContact: formatRelative(latestMessage?.sent_at || latestMessage?.created_at),
      createdAt: contact.created_at,
      history: contactMessages.slice(0, 10).map((message) => ({
        id: message.id,
        title: message.direction === "inbound" ? "Resposta recebida" : message.status === "opened" ? "WhatsApp aberto" : "Mensagem registrada",
        detail: message.body,
        time: formatRelative(message.sent_at || message.created_at),
      })),
    };
  });

  const sequenceRow = sequencesResult.data?.find((item) => item.active);
  let sequence = null;
  if (sequenceRow) {
    const { data: steps, error } = await supabase.from("sequence_steps").select("id,delay_days,title,message_template,enabled,position").eq("sequence_id", sequenceRow.id).order("position");
    if (error) return NextResponse.json({ error: "Não foi possível carregar a cadência." }, { status: 500 });
    sequence = {
      id: sequenceRow.id,
      name: sequenceRow.name,
      audience: sequenceRow.audience,
      pauseOnReply: sequenceRow.pause_on_reply,
      steps: (steps || []).map((step) => ({ id: step.id, delayDays: step.delay_days, title: step.title, message: step.message_template, enabled: step.enabled })),
    };
  }

  return NextResponse.json({
    contacts,
    sequence,
    sequences: (sequencesResult.data || []).map((item) => ({
      id: item.id,
      name: item.name,
      audience: item.audience,
      pauseOnReply: item.pause_on_reply,
      active: item.active,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    tags: tagsResult.data || [],
  });
}
