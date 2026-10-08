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

type QueryErrorDetails = { message: string; code: string | null };

class AppDataQueryError extends Error {
  constructor(
    readonly query: string,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "AppDataQueryError";
  }
}

function getQueryErrorDetails(error: unknown): QueryErrorDetails {
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; code?: unknown };
    return {
      message: typeof value.message === "string" ? value.message : "Erro desconhecido do Supabase.",
      code: typeof value.code === "string" ? value.code : null,
    };
  }
  return { message: error instanceof Error ? error.message : String(error), code: null };
}

async function runQuery<T extends { error: unknown }>(query: string, operation: PromiseLike<T>) {
  try {
    const result = await operation;
    if (result.error) {
      const details = getQueryErrorDetails(result.error);
      throw new AppDataQueryError(query, details.code, details.message);
    }
    return result;
  } catch (error) {
    if (error instanceof AppDataQueryError) throw error;
    const details = getQueryErrorDetails(error);
    throw new AppDataQueryError(query, details.code, details.message);
  }
}

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

  try {
  const [contactsResult, sequencesResult, linksResult, messagesResult, tagsResult, contactTagsResult] = await Promise.all([
    runQuery("contacts", supabase.from("contacts").select("id,name,phone,email,kind,interest,origin,status,note,created_at").eq("owner_id", user.id).order("created_at", { ascending: false })),
    runQuery("sequences", supabase.from("sequences").select("id,name,audience,pause_on_reply,active,created_at,updated_at").eq("owner_id", user.id).order("created_at", { ascending: true })),
    runQuery("contact_sequences", supabase.from("contact_sequences").select("contact_id,next_run_at,paused_at,completed_at").is("completed_at", null)),
    runQuery("messages", supabase.from("messages").select("id,contact_id,direction,body,status,sent_at,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(100)),
    runQuery("tags", supabase.from("tags").select("id,name,color,created_at,updated_at").eq("user_id", user.id).order("name")),
    runQuery("contact_tags", supabase.from("contact_tags").select("contact_id,tag_id").eq("user_id", user.id)),
  ]);

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
    const { data: steps } = await runQuery("sequence_steps", supabase.from("sequence_steps").select("id,delay_days,title,message_template,enabled,position").eq("sequence_id", sequenceRow.id).order("position"));
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
  } catch (error) {
    const details = getQueryErrorDetails(error);
    console.error("[api/app-data] Supabase query failed", {
      query: error instanceof AppDataQueryError ? error.query : "unknown",
      message: details.message,
      code: error instanceof AppDataQueryError ? error.code : details.code,
      userId: user.id,
    });
    return NextResponse.json({ error: "Não foi possível carregar seus dados." }, { status: 500 });
  }
}
