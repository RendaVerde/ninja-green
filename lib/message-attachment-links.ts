import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { attachmentLinkTtlSeconds, messageAttachmentsBucket, type MessageAttachment, type SignedMessageAttachment } from "@/lib/message-attachments";

export async function signMessageAttachments(supabase: SupabaseClient, userId: string, attachments: MessageAttachment[]) {
  if (!attachments.length) return [];
  if (attachments.some((attachment) => !attachment.path.startsWith(`${userId}/`))) {
    throw new Error("Anexo inválido para esta conta.");
  }

  const { data, error } = await supabase.storage
    .from(messageAttachmentsBucket)
    .createSignedUrls(attachments.map((attachment) => attachment.path), attachmentLinkTtlSeconds);
  if (error) throw new Error("Não foi possível preparar os links dos anexos.");

  return attachments.map((attachment, index): SignedMessageAttachment => ({
    ...attachment,
    url: data[index]?.signedUrl || "",
  })).filter((attachment) => attachment.url);
}
