"use client";

import { useMemo, useState } from "react";
import { Search, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Lead } from "@/lib/demo-data";

export function ContactMultiselect({ contacts, selectedIds, onChange }: { contacts: Lead[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);

  const visibleContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) => `${contact.name} ${contact.phone} ${contact.email || ""} ${contact.interest}`.toLowerCase().includes(term));
  }, [contacts, search]);

  function toggle(id: string) {
    setDraftIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }

  function openPicker() {
    setDraftIds(selectedIds);
    setSearch("");
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={openPicker} className="justify-start"><UsersRound className="mr-2 size-4" />Contatos escolhidos ({selectedIds.length})</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Selecionar contatos</SheetTitle>
            <SheetDescription>Busque e escolha contatos específicos para este fluxo.</SheetDescription>
          </SheetHeader>
          <div className="relative mx-4"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82928b]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, telefone ou interesse" className="pl-9" /></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-2">
              {visibleContacts.map((contact) => {
                const checked = draftIds.includes(contact.id);
                return <button type="button" key={contact.id} onClick={() => toggle(contact.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${checked ? "border-[#87b83a] bg-[#f0f7e7]" : "border-[#e1e9e4]"}`}><Checkbox checked={checked} className="pointer-events-none" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{contact.name}</strong><span className="mt-0.5 block truncate text-xs text-[#71827a]">{contact.phone} · {contact.kind}</span></span></button>;
              })}
              {!visibleContacts.length && <p className="py-10 text-center text-sm text-[#71827a]">Nenhum contato encontrado.</p>}
            </div>
          </div>
          <SheetFooter className="border-t bg-white">
            <div className="mb-1 text-center text-xs text-[#71827a]">{draftIds.length} contato(s) selecionado(s)</div>
            <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="button" onClick={() => { onChange(draftIds); setOpen(false); }} className="bg-[#0b553f] hover:bg-[#074632]">Aplicar</Button></div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
