import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { signMessageAttachments } from "@/lib/message-attachment-links";
import {
  appendAttachmentLinks,
  appendAttachmentSummary,
  type MessageAttachment,
} from "@/lib/message-attachments";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { ManualWhatsAppProvider } from "@/lib/whatsapp/manual";

export class OutboundMessageError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "OUTBOUND_MESSAGE_ERROR",
  ) {
    super(message);
    this.name = "OutboundMessageError";
  }
}

type SendOutboundMessageInput = {
  supabase: SupabaseClient;
  userId: string;
  contactId: string;
  body: string;
  messageId: string;
  source: "single" | "quick";
  forceManual?: boolean;
  connectionId?: string;
  attachments?: MessageAttachment[];
};

export type SendOutboundMessageResult = {
  messageId: string;
  createdAt: string;
  mode: "queue" | "manual";
  provider: "zpro" | "manual";
  status: "pending" | "opened";
  whatsappUrl: string | null;
  deduplicated: boolean;
};

type ExistingMessage = {
  id: string;
  contact_id: string;
  body: string;
  provider: string | null;
  status: string;
  queue_status: string | null;
  created_at: string;
};

async function loadExistingMessage(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
) {
  const { data, error } = await supabase
    .from("messages")
    .select("id,contact_id,body,provider,status,queue_status,created_at")
    .eq("id", messageId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) {
    throw new OutboundMessageError(
      "Não foi possível recuperar a tentativa de envio.",
      500,
    );
  }
  return data as ExistingMessage | null;
}

async function resolveSettings(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("outbound_settings")
    .select("pause_all,last_used_connection_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new OutboundMessageError(
      "Não foi possível consultar as configurações de envio.",
      500,
    );
  }
  return {
    pauseAll: data?.pause_all ?? false,
    lastUsedConnectionId: data?.last_used_connection_id as
      | string
      | null
      | undefined,
  };
}

async function resolveConnection(
  supabase: SupabaseClient,
  userId: string,
  requestedConnectionId?: string,
  lastUsedConnectionId?: string | null,
) {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("id,health_status")
    .eq("owner_id", userId)
    .eq("provider", "zpro")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    throw new OutboundMessageError(
      "Não foi possível consultar as conexões WhatsApp.",
      500,
    );
  }
  const connections = data || [];
  if (!connections.length) {
    if (requestedConnectionId) {
      throw new OutboundMessageError(
        "A conexão selecionada está inativa ou não pertence à sua conta.",
        400,
        "INVALID_CONNECTION",
      );
    }
    return null;
  }
  if (requestedConnectionId) {
    const requested = connections.find(
      (item) => item.id === requestedConnectionId,
    );
    if (!requested) {
      throw new OutboundMessageError(
        "A conexão selecionada está inativa ou não pertence à sua conta.",
        400,
        "INVALID_CONNECTION",
      );
    }
    return requested;
  }
  if (connections.length === 1) return connections[0];
  const lastUsed = connections.find(
    (item) => item.id === lastUsedConnectionId,
  );
  if (lastUsed) return lastUsed;
  if (connections.length > 1) {
    throw new OutboundMessageError(
      "Escolha qual conexão WhatsApp deve realizar o envio.",
      409,
      "CONNECTION_REQUIRED",
    );
  }
  return null;
}

async function recordManualFallback(
  input: SendOutboundMessageInput,
  phone: string,
  body: string,
  attachments: MessageAttachment[],
  existing: ExistingMessage | null,
): Promise<SendOutboundMessageResult> {
  const signedAttachments = await signMessageAttachments(
    input.supabase,
    input.userId,
    attachments,
  );
  const manualBody = appendAttachmentLinks(input.body, signedAttachments);
  const manualProvider = new ManualWhatsAppProvider();
  const manualResult = await manualProvider.sendText({
    body: manualBody,
    number: phone,
    externalKey: input.messageId,
  });
  const now = new Date().toISOString();
  if (!existing) {
    const { error } = await input.supabase.from("messages").insert({
      id: input.messageId,
      owner_id: input.userId,
      contact_id: input.contactId,
      channel: "whatsapp",
      provider: "manual",
      direction: "outbound",
      body,
      status: "opened",
      queue_status: "canceled",
      source: input.source,
      priority: 300,
      scheduled_at: now,
      confirmed_at: now,
      canceled_at: now,
      cancel_reason: "manual_fallback_opened",
      sent_at: now,
    });
    if (error) {
      throw new OutboundMessageError(
        "Não foi possível registrar o envio manual.",
        500,
      );
    }
    await input.supabase
      .from("contacts")
      .update({ status: "Em contato", updated_at: now })
      .eq("id", input.contactId)
      .eq("owner_id", input.userId)
      .eq("status", "Novo");
  }
  return {
    messageId: input.messageId,
    createdAt: existing?.created_at || now,
    mode: "manual",
    provider: "manual",
    status: "opened",
    whatsappUrl: manualResult.whatsappUrl || null,
    deduplicated: Boolean(existing),
  };
}

export async function sendOutboundMessage(
  input: SendOutboundMessageInput,
): Promise<SendOutboundMessageResult> {
  const attachments = input.attachments || [];
  const storedBody = appendAttachmentSummary(input.body, attachments);
  const existing = await loadExistingMessage(
    input.supabase,
    input.userId,
    input.messageId,
  );
  if (existing) {
    if (
      existing.contact_id !== input.contactId ||
      existing.body !== storedBody
    ) {
      throw new OutboundMessageError(
        "A identificação deste envio já está sendo usada.",
        409,
        "MESSAGE_ID_CONFLICT",
      );
    }
    if (
      existing.queue_status === "pending" ||
      existing.queue_status === "sending" ||
      existing.queue_status === "sent"
    ) {
      return {
        messageId: existing.id,
        createdAt: existing.created_at,
        mode: "queue",
        provider: "zpro",
        status: "pending",
        whatsappUrl: null,
        deduplicated: true,
      };
    }
    if (existing.status === "opened" && existing.provider === "manual") {
      return {
        messageId: existing.id,
        createdAt: existing.created_at,
        mode: "manual",
        provider: "manual",
        status: "opened",
        whatsappUrl: null,
        deduplicated: true,
      };
    }
    throw new OutboundMessageError(
      "Esta tentativa já foi registrada. Inicie um novo envio pelo histórico.",
      409,
      "MESSAGE_ID_CONFLICT",
    );
  }

  const [{ data: contact, error: contactError }, settings] = await Promise.all([
    input.supabase
      .from("contacts")
      .select("id,phone,do_not_contact")
      .eq("id", input.contactId)
      .eq("owner_id", input.userId)
      .maybeSingle(),
    resolveSettings(input.supabase, input.userId),
  ]);
  if (contactError) {
    throw new OutboundMessageError("Não foi possível localizar o contato.", 500);
  }
  if (!contact) {
    throw new OutboundMessageError("Contato não encontrado.", 404);
  }
  if (contact.do_not_contact) {
    throw new OutboundMessageError(
      "Este contato está marcado como não contatar.",
      409,
      "DO_NOT_CONTACT",
    );
  }
  if (settings.pauseAll) {
    throw new OutboundMessageError(
      "Todos os envios estão pausados.",
      409,
      "OUTBOUND_PAUSED",
    );
  }
  const phone = normalizeWhatsAppPhone(contact.phone);
  if (!phone) {
    throw new OutboundMessageError(
      "O contato não possui um WhatsApp válido.",
      400,
    );
  }

  if (input.forceManual || attachments.length > 0) {
    return recordManualFallback(
      input,
      phone,
      storedBody,
      attachments,
      existing,
    );
  }

  const connection = await resolveConnection(
    input.supabase,
    input.userId,
    input.connectionId,
    settings.lastUsedConnectionId,
  );
  if (!connection) {
    return recordManualFallback(
      input,
      phone,
      storedBody,
      attachments,
      existing,
    );
  }
  if (connection.health_status === "error") {
    throw new OutboundMessageError(
      "A conexão selecionada está com erro. Teste ou corrija a conexão antes de enviar.",
      409,
      "CONNECTION_ERROR",
    );
  }

  const now = new Date().toISOString();
  const { error } = await input.supabase.from("messages").insert({
    id: input.messageId,
    owner_id: input.userId,
    contact_id: input.contactId,
    channel: "whatsapp",
    direction: "outbound",
    body: storedBody,
    status: "queued",
    queue_status: "pending",
    source: input.source,
    connection_id: connection.id,
    priority: 300,
    scheduled_at: now,
    confirmed_at: now,
  });
  if (error) {
    if (error.code === "23505") {
      throw new OutboundMessageError(
        "Este envio já foi solicitado.",
        409,
        "MESSAGE_ID_CONFLICT",
      );
    }
    throw new OutboundMessageError(
      "Não foi possível adicionar a mensagem à fila.",
      500,
    );
  }
  await input.supabase.from("outbound_settings").upsert(
    {
      user_id: input.userId,
      last_used_connection_id: connection.id,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  return {
    messageId: input.messageId,
    createdAt: now,
    mode: "queue",
    provider: "zpro",
    status: "pending",
    whatsappUrl: null,
    deduplicated: false,
  };
}
