"use client";

import { useState } from "react";
import { Loader2, Tags } from "lucide-react";
import { toast } from "sonner";

import { QuickTagCreator } from "@/components/tags/quick-tag-creator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ContactTag, Lead } from "@/lib/demo-data";

export function ContactTagSelector({ contact, tags, onUpdated, onTagCreated }: { contact: Lead; tags: ContactTag[]; onUpdated: (tagIds: string[]) => void; onTagCreated: (tag: ContactTag) => void }) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(contact.tagIds || []);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${contact.id}/tags`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagIds: selectedIds }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; tagIds?: string[] };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar as tags.");
      onUpdated(payload.tagIds || selectedIds);
      setOpen(false);
      toast.success("Tags do contato atualizadas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar as tags.");
    } finally {
      setSaving(false);
    }
  }

  return <><Button type="button" variant="outline" size="sm" onClick={() => { setSelectedIds(contact.tagIds || []); setOpen(true); }}><Tags className="mr-2 size-4" />Editar tags</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Tags de {contact.name}</DialogTitle><DialogDescription>Use tags para organizar o contato e incluí-lo em públicos de sequência.</DialogDescription></DialogHeader><QuickTagCreator tags={tags} onTagAvailable={onTagCreated} onSelect={(tagId) => setSelectedIds((ids) => ids.includes(tagId) ? ids : [...ids, tagId])} /><div className="space-y-2">{tags.map((tag) => { const checked = selectedIds.includes(tag.id); return <button type="button" key={tag.id} onClick={() => setSelectedIds((items) => checked ? items.filter((item) => item !== tag.id) : [...items, tag.id])} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${checked ? "border-[#87b83a] bg-[#f0f7e7]" : "border-[#e1e9e4]"}`}><Checkbox checked={checked} className="pointer-events-none" /><span className="size-3 rounded-full" style={{ backgroundColor: tag.color || "#93c83e" }} /><span className="text-sm font-semibold">{tag.name}</span></button>; })}{!tags.length && <p className="rounded-xl bg-[#f3f7f4] p-5 text-center text-sm text-[#71827a]">Crie tags no gerenciador da sequência antes de aplicá-las.</p>}</div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="button" onClick={save} disabled={saving} className="bg-[#0b553f] hover:bg-[#074632]">{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar tags</Button></div></DialogContent></Dialog></>;
}
export function ContactTagBadges({ contact, tags }: { contact: Lead; tags: ContactTag[] }) {
  const selected = tags.filter((tag) => (contact.tagIds || []).includes(tag.id));
  if (!selected.length) return <span className="text-xs text-[#8a9992]">Sem tags</span>;
  return <div className="flex flex-wrap gap-1.5">{selected.map((tag) => <Badge key={tag.id} variant="outline" className="bg-white"><span className="size-2 rounded-full" style={{ backgroundColor: tag.color || "#93c83e" }} />{tag.name}</Badge>)}</div>;
}
