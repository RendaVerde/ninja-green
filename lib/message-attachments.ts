export const messageAttachmentsBucket = "message-attachments";
export const maxMessageAttachments = 5;
export const maxMessageAttachmentBytes = 50 * 1024 * 1024;
export const attachmentLinkTtlSeconds = 7 * 24 * 60 * 60;

export type MessageAttachment = {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
};

export type SignedMessageAttachment = MessageAttachment & { url: string };

export function isAllowedMessageAttachment(file: Pick<File, "type" | "size">) {
  const allowedType = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf";
  return allowedType && file.size > 0 && file.size <= maxMessageAttachmentBytes;
}

export function attachmentsBelongToUser(attachments: MessageAttachment[], userId: string) {
  return attachments.every((attachment) => attachment.path.startsWith(`${userId}/`));
}

export function appendAttachmentLinks(body: string, attachments: SignedMessageAttachment[]) {
  if (!attachments.length) return body.trim();
  const links = attachments.map((attachment) => `📎 ${attachment.name}: ${attachment.url}`);
  return `${body.trim()}\n\n${links.join("\n")}`;
}
