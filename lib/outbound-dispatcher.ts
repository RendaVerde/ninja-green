import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runOutboundDispatcher,
  type ClaimedOutboundMessage,
  type DispatchFailure,
  type OutboundDeliveryContext,
  type OutboundDispatchStore,
  type ProviderDeliveryResult,
} from "@/lib/outbound-dispatcher-core";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { getOwnedConnectionCredentials } from "@/lib/whatsapp/connection-config";
import { createWhatsAppProvider } from "@/lib/whatsapp/factory";

const dispatcherMaxDurationMs = 38_000;
const providerBudgetMs = 12_000;
const leaseSeconds = 75;

type ClaimedRow = {
  id: string;
  owner_id: string;
  contact_id: string;
  connection_id: string;
  body: string;
  source: "single" | "quick" | "sequence";
  claim_token: string;
};

function mapClaimed(row: ClaimedRow): ClaimedOutboundMessage {
  return {
    id: row.id,
    ownerId: row.owner_id,
    contactId: row.contact_id,
    connectionId: row.connection_id,
    body: row.body,
    source: row.source,
    claimToken: row.claim_token,
  };
}

async function advanceActiveSequence(
  admin: SupabaseClient,
  message: Pick<ClaimedOutboundMessage, "source" | "contactId" | "ownerId">,
) {
  if (message.source !== "single") return;
  const { data: link } = await admin
    .from("contact_sequences")
    .select("id,sequence_id,current_step")
    .eq("contact_id", message.contactId)
    .is("paused_at", null)
    .is("completed_at", null)
    .maybeSingle();
  if (!link) return;
  const { data: sequence } = await admin
    .from("sequences")
    .select("id")
    .eq("id", link.sequence_id)
    .eq("owner_id", message.ownerId)
    .maybeSingle();
  if (!sequence) return;
  const { data: steps } = await admin
    .from("sequence_steps")
    .select("delay_days")
    .eq("sequence_id", link.sequence_id)
    .eq("enabled", true)
    .order("position");
  const nextIndex = link.current_step + 1;
  const nextStep = steps?.[nextIndex];
  if (!nextStep) {
    await admin
      .from("contact_sequences")
      .update({ completed_at: new Date().toISOString(), next_run_at: null })
      .eq("id", link.id);
    return;
  }
  const nextRunAt = new Date();
  nextRunAt.setDate(nextRunAt.getDate() + nextStep.delay_days);
  await admin
    .from("contact_sequences")
    .update({ current_step: nextIndex, next_run_at: nextRunAt.toISOString() })
    .eq("id", link.id);
}

class SupabaseOutboundDispatchStore implements OutboundDispatchStore {
  constructor(private readonly admin: SupabaseClient) {}

  async claim(input: {
    dispatcherId: string;
    ownerId?: string;
    batchSize: number;
    perConnectionLimit: number;
    leaseSeconds: number;
  }) {
    const { data, error } = await this.admin.rpc("claim_outbound_messages", {
      target_dispatcher_id: input.dispatcherId,
      target_batch_size: input.batchSize,
      target_per_connection_limit: input.perConnectionLimit,
      target_lease_seconds: input.leaseSeconds,
      target_owner_id: input.ownerId || null,
    });
    if (error) throw new Error("Não foi possível reservar mensagens da fila.");
    return ((data || []) as ClaimedRow[]).map(mapClaimed);
  }

  async loadContext(message: ClaimedOutboundMessage): Promise<OutboundDeliveryContext> {
    const [contactResult, connectionResult, settingsResult] = await Promise.all([
      this.admin
        .from("contacts")
        .select("id,phone,do_not_contact")
        .eq("id", message.contactId)
        .eq("owner_id", message.ownerId)
        .maybeSingle(),
      this.admin
        .from("whatsapp_connections")
        .select("id,active,health_status")
        .eq("id", message.connectionId)
        .eq("owner_id", message.ownerId)
        .eq("provider", "zpro")
        .maybeSingle(),
      this.admin
        .from("outbound_settings")
        .select("pause_all,automatic_sending_enabled")
        .eq("user_id", message.ownerId)
        .maybeSingle(),
    ]);
    if (contactResult.error || connectionResult.error || settingsResult.error) {
      throw Object.assign(new Error("Não foi possível verificar as condições de envio."), {
        code: "OUTBOUND_PAUSED",
      });
    }
    const contact = contactResult.data;
    const connection = connectionResult.data;
    const settings = settingsResult.data;
    if (settings?.pause_all) throw Object.assign(new Error("Todos os envios estão pausados."), { code: "OUTBOUND_PAUSED" });
    if (message.source === "sequence" && !settings?.automatic_sending_enabled) {
      throw Object.assign(new Error("O envio automático está desligado."), { code: "OUTBOUND_PAUSED" });
    }
    if (!contact) throw Object.assign(new Error("Contato não encontrado."), { status: 404, code: "CONTACT_NOT_FOUND" });
    if (contact.do_not_contact) throw Object.assign(new Error("Este contato está marcado como não contatar."), { status: 422, code: "DO_NOT_CONTACT" });
    if (!connection?.active) throw Object.assign(new Error("A conexão selecionada está inativa."), { status: 422, code: "CONNECTION_INACTIVE" });
    if (connection.health_status === "error") throw Object.assign(new Error("A conexão selecionada está com erro."), { status: 422, code: "CONNECTION_ERROR" });
    const phone = normalizeWhatsAppPhone(contact.phone);
    if (!phone) throw Object.assign(new Error("O contato não possui um WhatsApp válido."), { status: 422, code: "INVALID_PHONE" });
    return { ...message, phone };
  }

  async markRequestStarted(message: ClaimedOutboundMessage) {
    const [settingsResult, contactResult] = await Promise.all([
      this.admin
        .from("outbound_settings")
        .select("pause_all,automatic_sending_enabled")
        .eq("user_id", message.ownerId)
        .maybeSingle(),
      this.admin
        .from("contacts")
        .select("do_not_contact")
        .eq("id", message.contactId)
        .eq("owner_id", message.ownerId)
        .maybeSingle(),
    ]);
    if (settingsResult.error || contactResult.error) return false;
    const settings = settingsResult.data;
    const contact = contactResult.data;
    if (
      !contact ||
      contact.do_not_contact ||
      settings?.pause_all ||
      (message.source === "sequence" && !settings?.automatic_sending_enabled)
    ) return false;
    const { data, error } = await this.admin
      .from("messages")
      .update({ request_started_at: new Date().toISOString() })
      .eq("id", message.id)
      .eq("owner_id", message.ownerId)
      .eq("claim_token", message.claimToken)
      .eq("queue_status", "sending")
      .is("request_started_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível registrar o início da chamada.");
    return Boolean(data);
  }

  async markSent(message: ClaimedOutboundMessage, result: ProviderDeliveryResult) {
    const sentAt = new Date().toISOString();
    const { data, error } = await this.admin
      .from("messages")
      .update({
        provider: result.provider,
        provider_message_id: result.providerMessageId || null,
        provider_ticket_id: result.ticketId || null,
        provider_error_code: null,
        provider_error_message: null,
        queue_status: "sent",
        status: "sent",
        sent_at: sentAt,
        claim_token: null,
        claim_expires_at: null,
      })
      .eq("id", message.id)
      .eq("owner_id", message.ownerId)
      .eq("claim_token", message.claimToken)
      .eq("queue_status", "sending")
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("Não foi possível confirmar o envio na fila.");
    await this.admin
      .from("contacts")
      .update({ status: "Em contato", updated_at: sentAt })
      .eq("id", message.contactId)
      .eq("owner_id", message.ownerId)
      .eq("status", "Novo");
    await advanceActiveSequence(this.admin, message);
  }

  async markFailed(message: ClaimedOutboundMessage, failure: DispatchFailure) {
    await this.admin
      .from("messages")
      .update({
        queue_status: "failed",
        status: "failed",
        provider_error_code: failure.code,
        provider_error_message: failure.message,
        claim_token: null,
        claim_expires_at: null,
      })
      .eq("id", message.id)
      .eq("owner_id", message.ownerId)
      .eq("claim_token", message.claimToken);
    if (
      failure.status === 401 ||
      failure.status === 403 ||
      [
        "ZPRO_INVALID_CREDENTIALS",
        "ZPRO_CHANNEL_NOT_FOUND",
        "CONNECTION_INACTIVE",
        "CONNECTION_ERROR",
      ].includes(failure.code)
    ) {
      await this.admin
        .from("whatsapp_connections")
        .update({
          health_status: "error",
          health_error: failure.message,
          health_checked_at: new Date().toISOString(),
        })
        .eq("id", message.connectionId)
        .eq("owner_id", message.ownerId);
    }
    if (message.source === "sequence") {
      await this.admin
        .from("contact_sequences")
        .update({
          paused_at: new Date().toISOString(),
          pause_reason: `Falha definitiva: ${failure.message}`,
          next_run_at: null,
        })
        .eq("contact_id", message.contactId)
        .is("paused_at", null)
        .is("completed_at", null);
    }
  }

  async markUnknown(message: ClaimedOutboundMessage, failure: DispatchFailure) {
    await this.admin
      .from("messages")
      .update({
        queue_status: "unknown",
        status: "failed",
        provider_error_code: failure.code,
        provider_error_message: failure.message,
        uncertainty_reason: "provider_result_not_confirmed",
        claim_token: null,
        claim_expires_at: null,
      })
      .eq("id", message.id)
      .eq("owner_id", message.ownerId)
      .eq("claim_token", message.claimToken);
    if (failure.status && failure.status >= 500) {
      await this.admin
        .from("whatsapp_connections")
        .update({
          health_status: "error",
          health_error: failure.message,
          health_checked_at: new Date().toISOString(),
        })
        .eq("id", message.connectionId)
        .eq("owner_id", message.ownerId);
    }
  }

  async releaseUnstarted(messages: ClaimedOutboundMessage[]) {
    await Promise.all(
      messages.map((message) =>
        this.admin
          .from("messages")
          .update({
            queue_status: "pending",
            status: "queued",
            claimed_at: null,
            claim_token: null,
            claim_expires_at: null,
          })
          .eq("id", message.id)
          .eq("owner_id", message.ownerId)
          .eq("claim_token", message.claimToken)
          .eq("queue_status", "sending")
          .is("request_started_at", null),
      ),
    );
  }
}

export async function dispatchOutboundBatch(options: { ownerId?: string } = {}) {
  const admin = createSupabaseAdminClient();
  const store = new SupabaseOutboundDispatchStore(admin);
  return runOutboundDispatcher(
    store,
    async (context) => {
      const allowedNumbers = (process.env.OUTBOUND_ALLOWED_NUMBERS || "")
        .split(",")
        .map((value) => normalizeWhatsAppPhone(value))
        .filter((value): value is string => Boolean(value));
      if (
        process.env.OUTBOUND_ALLOWED_NUMBERS !== "*" &&
        !allowedNumbers.includes(context.phone)
      ) {
        throw Object.assign(
          new Error("O envio real está bloqueado pela allowlist do servidor."),
          { code: "OUTBOUND_LIVE_SEND_DISABLED", status: 503 },
        );
      }
      const credentials = await getOwnedConnectionCredentials(
        context.ownerId,
        context.connectionId,
      );
      const provider = createWhatsAppProvider("zpro", credentials);
      return {
        async sendText(input) {
          const result = await provider.sendText({
            ...input,
            isClosed: false,
            validateNumber: true,
          });
          return {
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            ticketId: result.ticketId,
            rawStatus: result.rawStatus,
          };
        },
      };
    },
    {
      ownerId: options.ownerId,
      maxDurationMs: dispatcherMaxDurationMs,
      providerBudgetMs,
      batchSize: 3,
      perConnectionLimit: 3,
      leaseSeconds,
    },
  );
}

export { advanceActiveSequence };
