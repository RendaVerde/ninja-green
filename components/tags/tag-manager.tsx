"use client";

import { FormEvent, useState } from "react";
import { Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ContactTag } from "@/lib/demo-data";

type TagManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: ContactTag[];
  onTagsChange: (tags: ContactTag[]) => void;
  onTagDeleted: (id: string) => void;
};

export function TagManager({ open, onOpenChange, tags, onTagsChange, onTagDeleted }: TagManagerProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#93c83e");
  const [useColor, setUseColor] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#93c83e");
  const [editUseColor, setEditUseColor] = useState(true);

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color: useColor ? color : null }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; tag?: ContactTag };
      if (!response.ok || !payload.tag) throw new Error(payload.error || "Não foi possível criar a tag.");
      onTagsChange([...tags, payload.tag].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setName("");
      toast.success("Tag criada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a tag.");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(tag: ContactTag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || "#93c83e");
    setEditUseColor(Boolean(tag.color));
  }

  async function updateTag(tag: ContactTag) {
    setSaving(true);
    try {
      const response = await fetch(`/api/tags/${tag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editName, color: editUseColor ? editColor : null }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; tag?: ContactTag };
      if (!response.ok || !payload.tag) throw new Error(payload.error || "Não foi possível atualizar a tag.");
      onTagsChange(tags.map((item) => item.id === tag.id ? { ...item, ...payload.tag, contactCount: item.contactCount } : item).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setEditingId(null);
      toast.success("Tag atualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a tag.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTag(tag: ContactTag) {
    if (!window.confirm(`Excluir a tag ${tag.name}? Os contatos serão mantidos.`)) return;
    const response = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return toast.error(payload.error || "Não foi possível excluir a tag.");
    onTagsChange(tags.filter((item) => item.id !== tag.id));
    onTagDeleted(tag.id);
    toast.success("Tag excluída");
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl"><DialogHeader><div className="mb-2 grid size-11 place-items-center rounded-xl bg-[#e6f2d3] text-[#44701b]"><Tag className="size-5" /></div><DialogTitle>Gerenciar tags</DialogTitle><DialogDescription>Crie etiquetas próprias para organizar contatos e montar públicos.</DialogDescription></DialogHeader><form onSubmit={createTag} className="grid gap-3 rounded-xl bg-[#f3f7f4] p-4 sm:grid-cols-[1fr_auto_auto]"><Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} placeholder="Nome da tag" /><label className="flex items-center gap-2 rounded-md border bg-white px-3 text-xs font-semibold"><input type="checkbox" checked={useColor} onChange={(event) => setUseColor(event.target.checked)} />Cor{useColor && <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="size-7 border-0 bg-transparent p-0" />}</label><Button type="submit" disabled={saving || !name.trim()} className="bg-[#0b553f] hover:bg-[#074632]"><Plus className="mr-2 size-4" />Criar</Button></form><div className="space-y-2">{tags.map((tag) => <div key={tag.id} className="rounded-xl border border-[#e1e9e4] p-3">{editingId === tag.id ? <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={60} /><label className="flex items-center gap-2 rounded-md border px-2 text-xs"><input type="checkbox" checked={editUseColor} onChange={(event) => setEditUseColor(event.target.checked)} />Cor{editUseColor && <input type="color" value={editColor} onChange={(event) => setEditColor(event.target.value)} className="size-7 border-0 bg-transparent p-0" />}</label><div className="flex gap-1"><Button type="button" size="sm" onClick={() => updateTag(tag)} disabled={saving || !editName.trim()}>{saving && <Loader2 className="mr-1 size-3 animate-spin" />}Salvar</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button></div></div> : <div className="flex items-center gap-3"><span className="size-3 rounded-full" style={{ backgroundColor: tag.color || "#93c83e" }} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{tag.name}</strong><span className="text-xs text-[#71827a]">{tag.contactCount || 0} contato(s)</span></span><Button type="button" variant="ghost" size="icon" onClick={() => startEditing(tag)} aria-label={`Editar ${tag.name}`}><Pencil className="size-4" /></Button><Button type="button" variant="ghost" size="icon" onClick={() => deleteTag(tag)} aria-label={`Excluir ${tag.name}`} className="text-red-500"><Trash2 className="size-4" /></Button></div>}</div>)}{!tags.length && <p className="py-8 text-center text-sm text-[#71827a]">Nenhuma tag cadastrada.</p>}</div></DialogContent></Dialog>;
}
