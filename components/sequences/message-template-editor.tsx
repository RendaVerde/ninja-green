"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Braces, MessageCircle } from "lucide-react";

import { OverlayBackButton } from "@/components/overlay-back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { exampleMessageContact, messageVariables, renderMessageTemplate } from "@/lib/message-variables";
import { useBackClosable } from "@/hooks/use-back-closable";

export function MessageTemplateEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const back = useBackClosable(variablesOpen, () => setVariablesOpen(false));
  const preview = useMemo(() => renderMessageTemplate(value, exampleMessageContact), [value]);

  function insertVariable(key: string) {
    const textarea = textareaRef.current;
    const placeholder = `{{${key}}}`;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}${placeholder}${value.slice(end)}`;
    onChange(nextValue);
    back.close();
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-xs font-semibold text-[#4f675d]">Orientação da mensagem</label>
        <Button type="button" variant="outline" size="sm" onClick={() => setVariablesOpen(true)}>
          <Braces className="mr-2 size-4" />Variáveis
        </Button>
      </div>
      <Textarea ref={textareaRef} id={inputId} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 resize-y" />
      {preview.unknownVariables.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          <span>Variável desconhecida:</span>
          {preview.unknownVariables.map((key) => <Badge key={key} variant="outline" className="border-amber-300 bg-white text-amber-800">{`{{${key}}}`}</Badge>)}
        </div>
      )}
      <div className="rounded-xl border border-[#dfe8e2] bg-[#f8faf9] p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-[#6f8279]"><MessageCircle className="size-3.5" />Prévia com contato de exemplo</div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-[#294b3e]">{preview.text || "A mensagem aparecerá aqui."}</p>
      </div>

      <Sheet open={variablesOpen} onOpenChange={back.onOpenChange}>
        <SheetContent showCloseButton={false} className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="flex-row items-start border-b">
            <OverlayBackButton onClick={back.close} />
            <div className="min-w-0 pt-1"><SheetTitle>Variáveis da mensagem</SheetTitle><SheetDescription>Toque em uma variável para inseri-la na posição do cursor.</SheetDescription></div>
          </SheetHeader>
          <div className="space-y-2 px-4 pb-6">
            {messageVariables.map((variable) => (
              <button type="button" key={variable.key} onClick={() => insertVariable(variable.key)} className="w-full rounded-xl border border-[#dfe8e2] p-4 text-left transition hover:border-[#8bbd3c] hover:bg-[#f3f8ec]">
                <span className="flex items-center justify-between gap-3"><strong className="text-sm text-[#23483b]">{variable.label}</strong><code className="rounded bg-[#e9f3d8] px-2 py-1 text-xs font-bold text-[#41651f]">{`{{${variable.key}}}`}</code></span>
                <span className="mt-2 block text-xs leading-5 text-[#71827a]">{variable.description}</span>
                <span className="mt-1 block text-xs text-[#4f675d]">Exemplo: <strong>{variable.example}</strong></span>
                <span className="mt-1 block text-[11px] text-[#8a9992]">Origem: contacts.{variable.sourceField}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
