"use client";

import { Copy, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { FollowUpSequence } from "@/lib/demo-data";

type SequenceSwitcherProps = {
  sequences: FollowUpSequence[];
  selectedId: string | null;
  draftName: string;
  active: boolean;
  dirty: boolean;
  saving: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: () => void;
  onActiveChange: (active: boolean) => void;
};

export function SequenceSwitcher({ sequences, selectedId, draftName, active, dirty, saving, onSelect, onCreate, onDuplicate, onActiveChange }: SequenceSwitcherProps) {
  return (
    <section className="rounded-2xl border border-[#dfe8e2] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor="sequence-switcher" className="text-xs font-bold uppercase tracking-[.1em] text-[#75877f]">Fluxo em edição</label>
            {dirty && <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50">Alterações não salvas</Badge>}
          </div>
          <select id="sequence-switcher" value={selectedId || "__new__"} onChange={(event) => event.target.value !== "__new__" && onSelect(event.target.value)} disabled={saving} className="h-11 w-full rounded-xl border border-[#dce6e0] bg-[#f8faf9] px-3 text-sm font-semibold sm:max-w-md">
            {!selectedId && <option value="__new__">{draftName || "Nova sequência"}</option>}
            {sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}{sequence.active ? "" : " · inativa"}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-auto flex min-h-10 items-center gap-2 rounded-xl bg-[#f3f7f4] px-3 text-xs font-semibold lg:mr-2">
            <Switch checked={active} onCheckedChange={onActiveChange} disabled={saving} />
            {active ? "Fluxo ativo" : "Fluxo inativo"}
          </label>
          <Button type="button" variant="outline" onClick={onDuplicate} disabled={!selectedId || saving}><Copy className="mr-2 size-4" />Duplicar</Button>
          <Button type="button" variant="outline" onClick={onCreate} disabled={saving}><Plus className="mr-2 size-4" />Novo fluxo</Button>
        </div>
      </div>
    </section>
  );
}
