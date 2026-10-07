"use client";

import { useMemo, useState } from "react";
import { Settings2, Tag } from "lucide-react";

import { ContactMultiselect } from "@/components/sequences/contact-multiselect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { matchesAudience, type SequenceAudience } from "@/lib/audience";
import type { ContactTag, Lead } from "@/lib/demo-data";

type SequenceAudiencePickerProps = {
  audience: SequenceAudience;
  onAudienceChange: (audience: SequenceAudience) => void;
  tags: ContactTag[];
  selectedTagIds: string[];
  onTagIdsChange: (ids: string[]) => void;
  contacts: Lead[];
  selectedContactIds: string[];
  onContactIdsChange: (ids: string[]) => void;
  onManageTags: () => void;
};

export function SequenceAudiencePicker({ audience, onAudienceChange, tags, selectedTagIds, onTagIdsChange, contacts, selectedContactIds, onContactIdsChange, onManageTags }: SequenceAudiencePickerProps) {
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [draftTagIds, setDraftTagIds] = useState<string[]>(selectedTagIds);

  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));
  const resultCount = useMemo(() => contacts.filter((contact) => {
    if (!matchesAudience(audience, contact.kind)) return false;
    if (!selectedTagIds.length && !selectedContactIds.length) return true;
    return selectedContactIds.includes(contact.id) || (contact.tagIds || []).some((tagId) => selectedTagIds.includes(tagId));
  }).length, [audience, contacts, selectedContactIds, selectedTagIds]);

  function toggleTag(id: string) {
    setDraftTagIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }

  function openTagPicker() {
    setDraftTagIds(selectedTagIds);
    setTagSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:max-w-sm">
        <label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">Aplicar para<select value={audience} onChange={(event) => onAudienceChange(event.target.value as SequenceAudience)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option>Todos os contatos</option><option>Somente clientes</option><option>Somente licenciados</option></select></label>
        <span className="text-[11px] text-[#809087]">O tipo atual continua sendo o filtro principal.</span>
      </div>
      <div className="rounded-xl border border-[#e2eae5] bg-[#f8faf9] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">Refinar por tags ou contatos</p><p className="mt-1 text-xs leading-5 text-[#71827a]">O contato precisa atender ao tipo acima e possuir uma das tags ou estar escolhido diretamente.</p></div><Button type="button" variant="ghost" size="sm" onClick={onManageTags}><Settings2 className="mr-2 size-4" />Gerenciar tags</Button></div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={openTagPicker} className="justify-start"><Tag className="mr-2 size-4" />Tags selecionadas ({selectedTagIds.length})</Button><ContactMultiselect contacts={contacts} selectedIds={selectedContactIds} onChange={onContactIdsChange} /></div>
        {selectedTags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{selectedTags.map((tag) => <Badge key={tag.id} variant="outline" className="bg-white"><span className="size-2 rounded-full" style={{ backgroundColor: tag.color || "#93c83e" }} />{tag.name}</Badge>)}</div>}
        <div className="mt-4 rounded-lg bg-[#eaf3df] px-3 py-2 text-xs font-semibold text-[#376122]">Público atual: {resultCount} contato(s)</div>
      </div>

      <Sheet open={tagSheetOpen} onOpenChange={setTagSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader className="border-b"><SheetTitle>Selecionar tags</SheetTitle><SheetDescription>Um contato com qualquer uma das tags será incluído, respeitando Cliente/Licenciado.</SheetDescription></SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"><div className="space-y-2">{tags.map((tag) => { const checked = draftTagIds.includes(tag.id); return <button type="button" key={tag.id} onClick={() => toggleTag(tag.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${checked ? "border-[#87b83a] bg-[#f0f7e7]" : "border-[#e1e9e4]"}`}><Checkbox checked={checked} className="pointer-events-none" /><span className="size-3 rounded-full" style={{ backgroundColor: tag.color || "#93c83e" }} /><span className="flex-1 text-sm font-semibold">{tag.name}</span><span className="text-xs text-[#71827a]">{tag.contactCount || 0}</span></button>; })}{!tags.length && <div className="py-12 text-center"><Tag className="mx-auto size-7 text-[#89a096]" /><p className="mt-3 text-sm font-semibold">Nenhuma tag criada</p><Button type="button" variant="link" onClick={() => { setTagSheetOpen(false); onManageTags(); }}>Criar a primeira tag</Button></div>}</div></div>
          <SheetFooter className="border-t bg-white"><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={() => setTagSheetOpen(false)}>Cancelar</Button><Button type="button" onClick={() => { onTagIdsChange(draftTagIds); setTagSheetOpen(false); }} className="bg-[#0b553f] hover:bg-[#074632]">Aplicar</Button></div></SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
