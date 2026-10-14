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
import type {
  WhatsAppProvider,
  WhatsAppSendResult,
} from "@/lib/whatsapp/provider";
import { WhatsAppProviderError } from "@/lib/whatsapp/provider";
import { resolveWhatsAppProvider } from "@/lib/whatsapp/resolve-provider";

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
  forceManual?: boolean;
  attachments?: MessageAttachment[];
};

export type SendOutboundMessageResult = {
  messageId: string;
  sentAt: string;
  mode: "provider" | "manual";
  provider: string;
  status: "sent" | "opened";
  whatsappUrl: string | null;
  deduplicated: boolean;
  replayed: boolean;
};

type MessageRow = {
  id: string;
  contact_id: string;
  body: string;
  provider: string | null;
  status: string;
  sent_at: string | null;
};

async function loadExistingMessage(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
) {
  const { data, error } = await supabase
    .from("messages")
    .select("id,contact_id,body,provider,status,sent_at")
    .eq("id", messageId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) {
    throw new OutboundMessageError(
      "Não foi possível recuperar a tentativa de envio.",
      500,
    );
  }
  return data as MessageRow | null;
}

async function reserveMessage(
  input: SendOutboundMessageInput,
  contactId: string,
) {
  const { supabase, userId, body, messageId } = input;
  const { error } = await supabase.from("messages").insert({
    id: messageId,
    owner_id: userId,
    contact_id: contactId,
    channel: "whatsapp",
    direction: "outbound",
    body,
    status: "sending",
  });

  if (!error) return { deduplicated: false, completed: null };
  if (error.code !== "23505") {
    throw new OutboundMessageError(
      "Não foi possível preparar o histórico do envio.",
      500,
    );
  }

  const existing = await loadExistingMessage(supabase, userId, messageId);
  if (!existing || existing.contact_id !== contactId || existing.body !== body) {
    throw new OutboundMessageError(
      "A identificação deste envio já está sendo usada.",
      409,
      "MESSAGE_ID_CONFLICT",
    );
  }
  if (existing.status === "sent" || existing.status === "opened") {
    return { deduplicated: true, completed: existing };
  }
  if (existing.status === "sending") {
    throw new OutboundMessageError(
      "Este envio já está em andamento.",
      409,
      "MESSAGE_IN_PROGRESS",
    );
  }

  const { data: claimed, error: claimError } = await supabase
    .from("messages")
    .update({
      status: "sending",
      provider_error_code: null,
      provider_error_message: null,
    })
    .eq("id", messageId)
    .eq("owner_id", userId)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) {
    throw new OutboundMessageError(
      "Não foi possível retomar este envio.",
      409,
      "MESSAGE_RETRY_CONFLICT",
    );
  }
  return { deduplicated: true, completed: null };
}

async function markFailure(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
  providerName: string,
  error: unknown,
): Promise<never> {
  const code =
    error instanceof WhatsAppProviderError
      ? error.code
      : "WHATSAPP_SEND_ERROR";
  const message =
    error instanceof Error ? error.message : "Não foi possível enviar a mensagem.";
  await supabase
    .from("messages")
    .update({
      provider: providerName,
      status: "failed",
      provider_error_code: code,
      provider_error_message: message,
    })
    .eq("id", messageId)
    .eq("owner_id", userId);
  throw new OutboundMessageError(
    message,
    error instanceof WhatsAppProviderError ? error.status : 502,
    code,
  );
}

export async function sendOutboundMessage(
  input: SendOutboundMessageInput,
): Promise<SendOutboundMessageResult> {
  const {
    supabase,
    userId,
    contactId,
    body,
    messageId,
    attachments = [],
  } = input;
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,phone")
    .eq("id", contactId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (contactError) {
    throw new OutboundMessageError("Não foi possível localizar o contato.", 500);
  }
  if (!contact) throw new OutboundMessageError("Contato não encontrado.", 404);

  const number = normalizeWhatsAppPhone(contact.phone);
  if (!number) {
    throw new OutboundMessageError(
      "O contato não possui um WhatsApp válido.",
      400,
    );
  }

  const reservation = await reserveMessage(
    { ...input, body: appendAttachmentSummary(body, attachments) },
    contact.id,
  );
  if (reservation.completed) {
    const isManual = reservation.completed.status === "opened";
    let whatsappUrl: string | null = null;
    if (isManual) {
      const manualProvider = new ManualWhatsAppProvider();
      const signedAttachments = await signMessageAttachments(
        supabase,
        userId,
        attachments,
      );
      const manualResult = await manualProvider.sendText({
        body: appendAttachmentLinks(body, signedAttachments),
        number,
        externalKey: messageId,
      });
      whatsappUrl = manualResult.whatsappUrl || null;
    }
    return {
      messageId,
      sentAt: reservation.completed.sent_at || new Date().toISOString(),
      mode: isManual ? "manual" : "provider",
      provider: reservation.completed.provider || "manual",
      status: reservation.completed.status as "sent" | "opened",
      whatsappUrl,
      deduplicated: true,
      replayed: true,
    };
  }

  let provider: WhatsAppProvider;
  try {
    provider = input.forceManual
      ? new ManualWhatsAppProvider()
      : await resolveWhatsAppProvider(supabase);
  } catch (error) {
    return await markFailure(supabase, userId, messageId, "zpro", error);
  }

  try {
    const signedAttachments = await signMessageAttachments(
      supabase,
      userId,
      attachments,
    );
    let result: WhatsAppSendResult | undefined;
    if (provider.name === "manual") {
      result = await provider.sendText({
        body: appendAttachmentLinks(body, signedAttachments),
        number,
        externalKey: messageId,
        isClosed: false,
        validateNumber: true,
      });
    } else if (signedAttachments.length > 0) {
      for (const [index, attachment] of signedAttachments.entries()) {
        const mediaResult = await provider.sendMedia({
          body: index === 0 ? body : "",
          number,
          externalKey:
            index === 0 ? messageId : `${messageId}-media-${index + 1}`,
          isClosed: false,
          validateNumber: true,
          mediaUrl: attachment.url,
          mimeType: attachment.mimeType,
          fileName: attachment.name,
        });
        result ??= mediaResult;
      }
    } else {
      result = await provider.sendText({
        body,
        number,
        externalKey: messageId,
        isClosed: false,
        validateNumber: true,
      });
    }
    if (!result) {
      throw new OutboundMessageError(
        "Nenhuma mensagem foi processada.",
        500,
        "EMPTY_DELIVERY_RESULT",
      );
    }
    const sentAt = new Date().toISOString();
    const status = result.mode === "manual" ? "opened" : "sent";
    const { error: updateError } = await supabase
      .from("messages")
      .update({
        provider: result.provider,
        provider_message_id: result.providerMessageId || null,
        provider_ticket_id: result.ticketId || null,
        provider_error_code: null,
        provider_error_message: null,
        status,
        sent_at: sentAt,
      })
      .eq("id", messageId)
      .eq("owner_id", userId);
    if (updateError) {
      throw new OutboundMessageError(
        "A mensagem foi processada, mas o histórico não pôde ser atualizado.",
        500,
        "MESSAGE_HISTORY_UPDATE_FAILED",
      );
    }

    await supabase
      .from("contacts")
      .update({ status: "Em contato", updated_at: sentAt })
      .eq("id", contact.id)
      .eq("owner_id", userId)
      .eq("status", "Novo");

    return {
      messageId,
      sentAt,
      mode: result.mode,
      provider: result.provider,
      status,
      whatsappUrl: result.whatsappUrl || null,
      deduplicated: reservation.deduplicated,
      replayed: false,
    };
  } catch (error) {
    if (
      error instanceof OutboundMessageError &&
      error.code === "MESSAGE_HISTORY_UPDATE_FAILED"
    ) {
      throw error;
    }
    return await markFailure(
      supabase,
      userId,
      messageId,
      provider.name,
      error,
    );
  }
}
