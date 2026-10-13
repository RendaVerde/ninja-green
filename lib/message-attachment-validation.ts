import { z } from "zod";

import { maxMessageAttachmentBytes, maxMessageAttachments } from "@/lib/message-attachments";

export const messageAttachmentSchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(3).max(500),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(120).refine((value) => value.startsWith("image/") || value.startsWith("video/") || value === "application/pdf"),
  size: z.number().int().positive().max(maxMessageAttachmentBytes),
});

export const messageAttachmentsSchema = z.array(messageAttachmentSchema).max(maxMessageAttachments).default([]);
