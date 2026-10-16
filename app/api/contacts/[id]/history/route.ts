import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatMoment(value?: string | null) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Contato inválido." }, { status: 400 });
  }
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  const { data, error } = await supabase
    .from("messages")
    .select("id,direction,body,status,queue_status,provider,provider_error_message,sent_at,scheduled_at,created_at")
    .eq("owner_id", user.id)
    .eq("contact_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Não foi possível carregar o histórico." }, { status: 500 });

  return NextResponse.json({
    history: (data || []).map((message) => ({
      id: message.id,
      title:
        message.direction === "inbound" ? "Resposta recebida"
          : message.queue_status === "unknown" ? "Envio incerto"
            : message.queue_status === "pending" ? "Mensagem agendada"
              : message.queue_status === "sending" ? "Enviando mensagem"
                : message.queue_status === "failed" || message.status === "failed" ? "Falha no envio"
                  : message.queue_status === "sent" || message.status === "sent" ? `Enviada via ${message.provider === "zpro" ? "ZPRO" : "WhatsApp"}`
                    : message.queue_status === "canceled" ? "Envio cancelado"
                      : "Mensagem registrada",
      detail:
        message.status === "failed" && message.provider_error_message
          ? `${message.body}\n\nErro: ${message.provider_error_message}`
          : message.body,
      time: formatMoment(message.sent_at || message.scheduled_at || message.created_at),
      queueStatus: message.queue_status || null,
    })),
  });
}
