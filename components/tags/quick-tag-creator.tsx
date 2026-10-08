"use client";

import { FormEvent, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContactTag } from "@/lib/demo-data";

const suggestedColors = ["#93c83e", "#3b82f6", "#f59e0b", "#8b5cf6", "#f43f5e"];

type QuickTagCreatorProps = {
  tags: ContactTag[];
  onTagAvailable: (tag: ContactTag) => void;
  onSelect: (tagId: string) => void;
};

export function QuickTagCreator({ tags, onTagAvailable, onSelect }: QuickTagCreatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>("#93c83e");
  const [saving, setSaving] = useState(false);

  function finish(tag: ContactTag, created: boolean) {
    onTagAvailable(tag);
    onSelect(tag.id);
    setName("");
    setExpanded(false);
    toast.success(created ? "Tag criada e selecionada" : "Tag existente selecionada");
  }

  async function findExistingTag(normalizedName: string) {
    const local = tags.find((tag) => tag.name.trim().toLocaleLowerCase("pt-BR") === normalizedName);
    if (local) return local;
    const response = await fetch("/api/tags", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { tags?: ContactTag[] };
    return payload.tags?.find((tag) => tag.name.trim().toLocaleLowerCase("pt-BR") === normalizedName);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const normalizedName = trimmedName.toLocaleLowerCase("pt-BR");
    const existing = tags.find((tag) => tag.name.trim().toLocaleLowerCase("pt-BR") === normalizedName);
    if (existing) return finish(existing, false);

    setSaving(true);
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, color }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; tag?: ContactTag };
      if (response.status === 409) {
        const matchingTag = await findExistingTag(normalizedName);
        if (matchingTag) return finish(matchingTag, false);
      }
      if (!response.ok || !payload.tag) throw new Error(payload.error || "Não foi possível criar a tag.");
      finish(payload.tag, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a tag.");
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return <Button type="button" variant="outline" onClick={() => setExpanded(true)} className="h-11 w-full justify-center border-dashed border-[#86b63c] text-[#3d681c]"><Plus className="mr-2 size-5" />Criar tag rápida</Button>;
  }

  return (
    <form onSubmit={create} className="space-y-3 rounded-xl border border-[#cfe0ae] bg-[#f4f9ec] p-3">
      <div className="flex gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} autoFocus placeholder="Nome da tag" className="bg-white" />
        <Button type="button" variant="ghost" size="icon" onClick={() => { setExpanded(false); setName(""); }} aria-label="Cancelar criação" className="size-10 shrink-0"><X className="size-4" /></Button>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold text-[#61756c]">Cor opcional</p>
        <div className="flex flex-wrap gap-2">
          {suggestedColors.map((suggestedColor) => <button type="button" key={suggestedColor} onClick={() => setColor(suggestedColor)} aria-label={`Usar cor ${suggestedColor}`} className="grid size-10 place-items-center rounded-full border-2 border-white shadow ring-1 ring-[#d8e3dc]" style={{ backgroundColor: suggestedColor }}>{color === suggestedColor && <Check className="size-4 text-white" />}</button>)}
          <button type="button" onClick={() => setColor(null)} className={`h-10 rounded-full border px-3 text-xs font-semibold ${color === null ? "border-[#0b553f] bg-white text-[#0b553f]" : "border-[#d8e3dc] text-[#71827a]"}`}>Sem cor</button>
        </div>
      </div>
      <Button type="submit" disabled={saving || !name.trim()} className="h-11 w-full bg-[#0b553f] hover:bg-[#074632]">{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Criar</Button>
    </form>
  );
}
