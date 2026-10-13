"use client";

import { useRef, useState } from "react";
import {
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  isAllowedMessageAttachment,
  maxMessageAttachmentBytes,
  maxMessageAttachments,
  messageAttachmentsBucket,
  type MessageAttachment,
} from "@/lib/message-attachments";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <FileImage className="size-4" />;
  if (mimeType.startsWith("video/")) return <FileVideo className="size-4" />;
  return <FileText className="size-4" />;
}

export function AttachmentUploader({
  value,
  onChange,
}: {
  value: MessageAttachment[];
  onChange: (attachments: MessageAttachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const availableSlots = maxMessageAttachments - value.length;
    if (availableSlots <= 0)
      return toast.error(
        `Use no máximo ${maxMessageAttachments} anexos por mensagem.`,
      );
    const selectedFiles = Array.from(files).slice(0, availableSlots);
    if (selectedFiles.some((file) => !isAllowedMessageAttachment(file))) {
      return toast.error(
        `Aceitamos imagens, vídeos e PDFs de até ${Math.round(maxMessageAttachmentBytes / 1024 / 1024)} MB.`,
      );
    }

    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const uploaded: MessageAttachment[] = [];
      for (const file of selectedFiles) {
        const safeName = file.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "-");
        const id = crypto.randomUUID();
        const path = `${user.id}/${id}-${safeName}`;
        const { error } = await supabase.storage
          .from(messageAttachmentsBucket)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw new Error(`Falha ao enviar ${file.name}.`);
        uploaded.push({
          id,
          path,
          name: file.name,
          mimeType: file.type,
          size: file.size,
        });
      }
      onChange([...value, ...uploaded]);
      toast.success(
        uploaded.length === 1
          ? "Anexo enviado"
          : `${uploaded.length} anexos enviados`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar os anexos.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-[#dfe8e2] bg-[#f8faf9] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[#4f675d]">Anexos</p>
          <p className="mt-1 text-[11px] text-[#809087]">
            Imagens, vídeos ou PDFs · até {maxMessageAttachments} arquivos
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          onChange={(event) => void uploadFiles(event.target.files)}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || value.length >= maxMessageAttachments}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Paperclip className="mr-2 size-4" />
          )}
          Adicionar
        </Button>
      </div>
      {value.length > 0 && (
        <div className="mt-3 space-y-2">
          {value.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 rounded-lg border border-[#e1e9e4] bg-white px-3 py-2"
            >
              <span className="text-[#4e7926]">
                <AttachmentIcon mimeType={attachment.mimeType} />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs">
                  {attachment.name}
                </strong>
                <span className="text-[10px] text-[#809087]">
                  {formatSize(attachment.size)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover ${attachment.name}`}
                onClick={() =>
                  onChange(value.filter((item) => item.id !== attachment.id))
                }
                className="size-9 text-[#7b8b84] hover:text-red-600"
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
