import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  renderMessageTemplate,
  type MessageContact,
} from "@/lib/message-variables";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ClaimedEnrollment = {
  link_id: string;
  owner_id: string;
  contact_id: string;
  sequence_step_id: string;
  connection_id: string;
  step_position: number;
  message_template: string;
  attachments: unknown[] | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  contact_interest: string;
  contact_kind: "Cliente" | "Licenciado";
  contact_origin: string;
  contact_status: MessageContact["status"];
  contact_note: string | null;
  sequence_priority: number;
  jitter_min_seconds: number;
  jitter_max_seconds: number;
};

export type MaterializationSummary = {
  claimed: number;
  materialized: number;
  paused: number;
  released: number;
};

function randomJitter(minimum: number, maximum: number) {
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}

async function releaseClaim(
  admin: SupabaseClient,
  linkId: string,
  materializerId: string,
) {
  await admin.rpc("release_sequence_materialization", {
    target_link_id: linkId,
    target_materializer_id: materializerId,
  });
}

export async function materializeDueSequenceMessages() {
  const admin = createSupabaseAdminClient();
  const materializerId = crypto.randomUUID();
  const { data, error } = await admin.rpc("claim_due_sequence_enrollments", {
    target_materializer_id: materializerId,
    target_batch_size: 20,
    target_lease_seconds: 90,
  });
  if (error) throw new Error("Não foi possível materializar as cadências vencidas.");
  const enrollments = (data || []) as ClaimedEnrollment[];
  const summary: MaterializationSummary = {
    claimed: enrollments.length,
    materialized: 0,
    paused: 0,
    released: 0,
  };

  for (const enrollment of enrollments) {
    if (enrollment.attachments?.length) {
      await admin
        .from("contact_sequences")
        .update({
          paused_at: new Date().toISOString(),
          pause_reason: "A etapa possui anexo e exige envio manual.",
          next_run_at: null,
          materialize_token: null,
          materialize_expires_at: null,
        })
        .eq("id", enrollment.link_id)
        .eq("materialize_token", materializerId);
      summary.paused += 1;
      continue;
    }

    const rendered = renderMessageTemplate(enrollment.message_template, {
      name: enrollment.contact_name,
      phone: enrollment.contact_phone,
      email: enrollment.contact_email || "",
      interest: enrollment.contact_interest,
      kind: enrollment.contact_kind,
      origin: enrollment.contact_origin,
      status: enrollment.contact_status,
      note: enrollment.contact_note || "",
    });
    if (!rendered.text || rendered.unknownVariables.length) {
      await admin
        .from("contact_sequences")
        .update({
          paused_at: new Date().toISOString(),
          pause_reason: rendered.unknownVariables.length
            ? `Variáveis desconhecidas: ${rendered.unknownVariables.join(", ")}`
            : "A etapa gerou uma mensagem vazia.",
          next_run_at: null,
          materialize_token: null,
          materialize_expires_at: null,
        })
        .eq("id", enrollment.link_id)
        .eq("materialize_token", materializerId);
      summary.paused += 1;
      continue;
    }

    const messageId = crypto.randomUUID();
    const jitterSeconds = randomJitter(
      enrollment.jitter_min_seconds,
      enrollment.jitter_max_seconds,
    );
    const scheduledAt = new Date(Date.now() + jitterSeconds * 1000).toISOString();
    const { error: insertError } = await admin.from("messages").insert({
      id: messageId,
      owner_id: enrollment.owner_id,
      contact_id: enrollment.contact_id,
      contact_sequence_id: enrollment.link_id,
      sequence_step_id: enrollment.sequence_step_id,
      connection_id: enrollment.connection_id,
      channel: "whatsapp",
      direction: "outbound",
      body: rendered.text,
      status: "queued",
      queue_status: "pending",
      source: "sequence",
      priority:
        enrollment.step_position === 0
          ? Math.max(250, enrollment.sequence_priority)
          : enrollment.sequence_priority,
      scheduled_at: scheduledAt,
      confirmed_at: new Date().toISOString(),
    });
    if (insertError) {
      await releaseClaim(admin, enrollment.link_id, materializerId);
      summary.released += 1;
      continue;
    }
    const { data: finalized, error: finalizeError } = await admin.rpc(
      "finalize_sequence_materialization",
      {
        target_link_id: enrollment.link_id,
        target_materializer_id: materializerId,
        target_message_id: messageId,
        target_step_position: enrollment.step_position,
      },
    );
    if (finalizeError || !finalized) {
      await admin
        .from("messages")
        .update({
          queue_status: "canceled",
          status: "failed",
          canceled_at: new Date().toISOString(),
          cancel_reason: "sequence_materialization_lost",
        })
        .eq("id", messageId)
        .eq("queue_status", "pending");
      await releaseClaim(admin, enrollment.link_id, materializerId);
      summary.released += 1;
      continue;
    }
    summary.materialized += 1;
  }
  return summary;
}
