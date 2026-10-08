"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, Loader2, MessageCircle, Pencil, Plus, Send, Trash2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AudiencePicker } from "@/components/audience/audience-picker";
import { OverlayBackButton } from "@/components/overlay-back-button";
import { MessageTemplateEditor } from "@/components/sequences/message-template-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBackClosable } from "@/hooks/use-back-closable";
import type { SequenceAudience } from "@/lib/audience";
import type { ContactTag, Lead } from "@/lib/demo-data";

type QuickMessage = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type PreviewRecipient = {
  contactId: string;
  contactName: string;
  phone: string;
  body: string;
  whatsappUrl: string;
  unknownVariables: string[];
};

type PreviewPayload = {
  error?: string;
  message?: { id: string; title: string };
  matchedCount?: number;
  recipientCount?: number;
  recipients?: PreviewRecipient[];
  excluded?: Array<{ contactId: string; contactName: string; reason: string }>;
};

type QuickMessagesViewProps = {
  contacts: Lead[];
  tags: ContactTag[];
  onTagCreated: (tag: ContactTag) => void;
  onManageTags: () => void;
  onActivitiesRecorded: () => void;
};

type SendPhase = "audience" | "review" | "queue";

export function QuickMessagesView({ contacts, tags, onTagCreated, onManageTags, onActivitiesRecorded }: QuickMessagesViewProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendPhase, setSendPhase] = useState<SendPhase>("audience");
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [audience, setAudience] = useState<SequenceAudience>("Todos os contatos");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [limit, setLimit] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [recordedIds, setRecordedIds] = useState<string[]>([]);
  const [queueBusy, setQueueBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const closeEditor = useCallback(() => setEditorOpen(false), []);
  const closeSend = useCallback(() => {
    setSendOpen(false);
    setSendPhase("audience");
    setPreview(null);
    setQueueIndex(0);
    setOpenedIds([]);
    setRecordedIds([]);
    setCooldown(0);
  }, []);
  const editorBack = useBackClosable(editorOpen, closeEditor);
  const sendBack = useBackClosable(sendOpen, closeSend);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/quick-messages", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { error?: string; messages?: QuickMessage[] };
      if (response.status === 401) return router.push("/login");
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as mensagens rápidas.");
      setMessages(payload.messages || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as mensagens rápidas.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMessages(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMessages]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLimit(window.localStorage.getItem("ninja-green:quick-send-limit") || "");
      setIntervalSeconds(window.localStorage.getItem("ninja-green:quick-send-interval") || "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const recipients = preview?.recipients || [];
  const currentRecipient = recipients[queueIndex];
  const currentOpened = currentRecipient ? openedIds.includes(currentRecipient.contactId) : false;
  const currentRecorded = currentRecipient ? recordedIds.includes(currentRecipient.contactId) : false;
  const progress = recipients.length ? `${Math.min(queueIndex + 1, recipients.length)} de ${recipients.length}` : "0 de 0";
  const unknownVariables = useMemo(() => [...new Set((preview?.recipients || []).flatMap((recipient) => recipient.unknownVariables))], [preview]);

  function openNewEditor() {
    setEditingId(null);
    setDraftTitle("");
    setDraftBody("");
    setEditorOpen(true);
  }

  function openEditor(message: QuickMessage) {
    setEditingId(message.id);
    setDraftTitle(message.title);
    setDraftBody(message.body);
    setEditorOpen(true);
  }

  async function saveMessage() {
    if (!draftTitle.trim() || !draftBody.trim()) return toast.error("Preencha o título e a mensagem.");
    setSaving(true);
    const method = editingId ? "PATCH" : "POST";
    const endpoint = editingId ? `/api/quick-messages/${editingId}` : "/api/quick-messages";
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: draftTitle, body: draftBody }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: QuickMessage };
      if (!response.ok || !payload.message) throw new Error(payload.error || "Não foi possível salvar a mensagem.");
      setMessages((items) => editingId ? items.map((item) => item.id === editingId ? payload.message! : item) : [payload.message!, ...items]);
      toast.success(editingId ? "Mensagem atualizada" : "Mensagem criada");
      editorBack.close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a mensagem.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMessage(message: QuickMessage) {
    if (!window.confirm(`Excluir “${message.title}”?`)) return;
    const response = await fetch(`/api/quick-messages/${message.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return toast.error(payload.error || "Não foi possível excluir a mensagem.");
    setMessages((items) => items.filter((item) => item.id !== message.id));
    toast.success("Mensagem excluída");
  }

  function openSend(message: QuickMessage) {
    setSelectedMessageId(message.id);
    setAudience("Todos os contatos");
    setSelectedTagIds([]);
    setSelectedContactIds([]);
    setPreview(null);
    setSendPhase("audience");
    setSendOpen(true);
  }

  async function reviewSend() {
    const parsedLimit = Number(limit);
    const parsedInterval = Number(intervalSeconds);
    if (!selectedMessageId) return toast.error("Escolha uma mensagem.");
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 2000) return toast.error("Informe um limite entre 1 e 2000 contatos.");
    if (!Number.isInteger(parsedInterval) || parsedInterval < 1 || parsedInterval > 3600) return toast.error("Informe um intervalo entre 1 e 3600 segundos.");
    window.localStorage.setItem("ninja-green:quick-send-limit", String(parsedLimit));
    window.localStorage.setItem("ninja-green:quick-send-interval", String(parsedInterval));
    setReviewing(true);
    try {
      const response = await fetch("/api/quick-sends/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickMessageId: selectedMessageId, audience, tagIds: selectedTagIds, contactIds: selectedContactIds, limit: parsedLimit }),
      });
      const payload = await response.json().catch(() => ({})) as PreviewPayload;
      if (!response.ok) throw new Error(payload.error || "Não foi possível revisar o envio.");
      setPreview(payload);
      setSendPhase("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível revisar o envio.");
    } finally {
      setReviewing(false);
    }
  }

  function startQueue() {
    if (!recipients.length) return toast.error("Nenhum destinatário apto para este envio.");
    setQueueIndex(0);
    setOpenedIds([]);
    setRecordedIds([]);
    setCooldown(0);
    setSendPhase("queue");
  }

  async function registerCurrent() {
    if (!currentRecipient) return false;
    setQueueBusy(true);
    try {
      const response = await fetch("/api/quick-sends/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: currentRecipient.contactId, body: currentRecipient.body }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível registrar o envio.");
      setRecordedIds((ids) => ids.includes(currentRecipient.contactId) ? ids : [...ids, currentRecipient.contactId]);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o envio.");
      return false;
    } finally {
      setQueueBusy(false);
    }
  }

  async function openCurrentWhatsApp() {
    if (!currentRecipient?.whatsappUrl) return;
    window.open(currentRecipient.whatsappUrl, "_blank", "noopener,noreferrer");
    setOpenedIds((ids) => ids.includes(currentRecipient.contactId) ? ids : [...ids, currentRecipient.contactId]);
    if (queueIndex < recipients.length - 1) setCooldown(Number(intervalSeconds));
    const recorded = await registerCurrent();
    if (recorded) toast.success("WhatsApp aberto e atividade registrada.");
  }

  function nextRecipient() {
    if (!currentRecorded || cooldown > 0) return;
    setQueueIndex((index) => index + 1);
    setCooldown(0);
  }

  function skipRecipient() {
    if (queueIndex >= recipients.length - 1) return finishQueue();
    setQueueIndex((index) => index + 1);
    setCooldown(0);
  }

  function finishQueue() {
    onActivitiesRecorded();
    sendBack.close();
    toast.success("Fila de mensagens concluída.");
  }

  return (
    <>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#6f8179]"><Send className="size-4 text-[#7da62d]" />Comunicação avulsa</p><h1 className="text-3xl font-bold tracking-[-.04em] text-[#123c2f] sm:text-4xl">Mensagens rápidas</h1><p className="mt-2 max-w-2xl text-sm text-[#6d7f77]">Salve textos reutilizáveis e abra uma fila segura de conversas no WhatsApp, sem alterar suas cadências.</p></div>
        <Button onClick={openNewEditor} className="h-11 rounded-xl bg-[#0b553f] px-5 hover:bg-[#074632]"><Plus className="mr-2 size-4" />Nova mensagem</Button>
      </section>

      {loading ? <div className="mt-8 grid place-items-center rounded-2xl border border-[#dfe8e2] bg-white py-20"><Loader2 className="size-7 animate-spin text-[#6c9d31]" /></div> : messages.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#cfdcd4] bg-white px-6 py-16 text-center"><MessageCircle className="mx-auto size-9 text-[#7da62d]" /><h2 className="mt-4 text-lg font-bold">Sua biblioteca está vazia</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#71827a]">Crie mensagens com variáveis para reutilizar em contatos individuais ou grupos selecionados.</p><Button onClick={openNewEditor} className="mt-5 bg-[#0b553f] hover:bg-[#074632]"><Plus className="mr-2 size-4" />Criar primeira mensagem</Button></div>
      ) : (
        <div className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {messages.map((message) => <article key={message.id} className="flex min-h-56 flex-col rounded-2xl border border-[#dfe8e2] bg-white p-5 shadow-[0_8px_28px_rgba(28,66,52,.05)]"><div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#e9f3d8] text-[#47701f]"><MessageCircle className="size-5" /></div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`Editar ${message.title}`} onClick={() => openEditor(message)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={`Excluir ${message.title}`} onClick={() => void deleteMessage(message)} className="text-red-500 hover:text-red-600"><Trash2 className="size-4" /></Button></div></div><h2 className="mt-4 font-bold text-[#23483b]">{message.title}</h2><p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[#6d7f77]">{message.body}</p><Button onClick={() => openSend(message)} className="mt-auto w-full bg-[#22a568] hover:bg-[#198a56]"><Send className="mr-2 size-4" />Enviar</Button></article>)}
        </div>
      )}

      <Sheet open={editorOpen} onOpenChange={editorBack.onOpenChange}>
        <SheetContent showCloseButton={false} className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="flex-row items-start border-b"><OverlayBackButton onClick={editorBack.close} /><div className="min-w-0 pt-1"><SheetTitle>{editingId ? "Editar mensagem" : "Nova mensagem rápida"}</SheetTitle><SheetDescription>Use variáveis para personalizar automaticamente o texto para cada contato.</SheetDescription></div></SheetHeader>
          <div className="space-y-5 px-4 pb-6"><label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">Título<Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={120} placeholder="Ex.: Apresentação inicial" /></label><MessageTemplateEditor value={draftBody} onChange={setDraftBody} /><div className="grid grid-cols-2 gap-2 border-t border-[#e5ece8] pt-5"><Button variant="outline" onClick={editorBack.close}>Cancelar</Button><Button onClick={() => void saveMessage()} disabled={saving || !draftTitle.trim() || !draftBody.trim()} className="bg-[#0b553f] hover:bg-[#074632]">{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar</Button></div></div>
        </SheetContent>
      </Sheet>

      <Sheet open={sendOpen} onOpenChange={sendBack.onOpenChange}>
        <SheetContent showCloseButton={false} className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="flex-row items-start border-b"><OverlayBackButton onClick={sendBack.close} /><div className="min-w-0 pt-1"><SheetTitle>{sendPhase === "audience" ? "Preparar envio" : sendPhase === "review" ? "Revisar envio" : "Fila do WhatsApp"}</SheetTitle><SheetDescription>{sendPhase === "queue" ? `Contato ${progress}. Abra uma conversa por vez.` : "Este envio é independente das cadências existentes."}</SheetDescription></div></SheetHeader>

          {sendPhase === "audience" && <div className="space-y-5 px-4 pb-6"><label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">Mensagem<select value={selectedMessageId} onChange={(event) => setSelectedMessageId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm">{messages.map((message) => <option key={message.id} value={message.id}>{message.title}</option>)}</select></label><AudiencePicker audience={audience} onAudienceChange={setAudience} tags={tags} selectedTagIds={selectedTagIds} onTagIdsChange={setSelectedTagIds} contacts={contacts} selectedContactIds={selectedContactIds} onContactIdsChange={setSelectedContactIds} onManageTags={onManageTags} onTagCreated={onTagCreated} contextLabel="envio" /><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">Limite deste envio<Input type="number" min={1} max={2000} inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="Quantidade máxima" /></label><label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">Intervalo entre contatos<Input type="number" min={1} max={3600} inputMode="numeric" value={intervalSeconds} onChange={(event) => setIntervalSeconds(event.target.value)} placeholder="Segundos" /></label></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><strong className="block">Envio manual protegido</strong>O navegador abrirá uma conversa por vez. O botão Próximo será liberado após o intervalo escolhido.</div><Button onClick={() => void reviewSend()} disabled={reviewing} className="h-11 w-full bg-[#0b553f] hover:bg-[#074632]">{reviewing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UsersRound className="mr-2 size-4" />}Revisar destinatários</Button></div>}

          {sendPhase === "review" && preview && <div className="space-y-5 px-4 pb-6"><div className="grid grid-cols-3 gap-2"><Summary value={String(preview.matchedCount || 0)} label="Encontrados" /><Summary value={String(preview.recipientCount || 0)} label="Na fila" /><Summary value={String(preview.excluded?.length || 0)} label="De fora" /></div>{unknownVariables.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800"><div className="flex items-center gap-2 font-bold"><AlertTriangle className="size-4" />Variáveis desconhecidas</div><p className="mt-2">{unknownVariables.map((key) => `{{${key}}}`).join(", ")}</p></div>}{recipients[0] && <section className="rounded-2xl border border-[#dfe8e2] bg-[#f8faf9] p-4"><p className="text-[11px] font-bold uppercase tracking-[.1em] text-[#71827a]">Prévia real · {recipients[0].contactName}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#294b3e]">{recipients[0].body}</p></section>}{Boolean(preview.excluded?.length) && <section><h3 className="text-sm font-bold">Quem fica de fora</h3><div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{preview.excluded?.map((item) => <div key={item.contactId} className="flex items-center justify-between gap-3 rounded-xl border border-[#e4ebe7] px-3 py-2"><span className="truncate text-sm font-semibold">{item.contactName}</span><Badge variant="outline" className="shrink-0 text-[10px]">{item.reason}</Badge></div>)}</div></section>}<div className="grid grid-cols-2 gap-2 border-t border-[#e5ece8] pt-5"><Button variant="outline" onClick={() => setSendPhase("audience")}>Editar público</Button><Button onClick={startQueue} disabled={!recipients.length || unknownVariables.length > 0} className="bg-[#22a568] hover:bg-[#198a56]"><Send className="mr-2 size-4" />Iniciar fila</Button></div></div>}

          {sendPhase === "queue" && currentRecipient && <div className="space-y-5 px-4 pb-6"><div className="flex items-center justify-between"><Badge className="bg-[#e7f3d2] text-[#436b21] hover:bg-[#e7f3d2]">{progress}</Badge><span className="text-xs text-[#71827a]">{currentRecipient.phone}</span></div><section className="rounded-2xl border border-[#dfe8e2] bg-white p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#e9f3d8] text-sm font-bold text-[#315719]">{currentRecipient.contactName.slice(0, 1).toUpperCase()}</span><div><h3 className="font-bold">{currentRecipient.contactName}</h3><p className="text-xs text-[#71827a]">Mensagem personalizada</p></div></div><p className="mt-4 whitespace-pre-wrap rounded-xl bg-[#f3f7f4] p-4 text-sm leading-6 text-[#294b3e]">{currentRecipient.body}</p></section>{cooldown > 0 && <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800"><Clock3 className="size-4" />Próximo contato em {cooldown}s</div>}{!currentOpened ? <Button onClick={() => void openCurrentWhatsApp()} disabled={queueBusy} className="h-12 w-full bg-[#22a568] hover:bg-[#198a56]"><MessageCircle className="mr-2 size-5" />Abrir WhatsApp</Button> : !currentRecorded ? <Button onClick={() => void registerCurrent()} disabled={queueBusy} variant="outline" className="h-12 w-full">{queueBusy && <Loader2 className="mr-2 size-4 animate-spin" />}Tentar registrar novamente</Button> : <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"><Check className="size-4" />Atividade registrada no histórico</div>}<div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={skipRecipient} disabled={queueBusy}>{queueIndex === recipients.length - 1 ? "Encerrar" : "Pular"}</Button>{queueIndex === recipients.length - 1 ? <Button onClick={finishQueue} disabled={!currentRecorded} className="bg-[#0b553f] hover:bg-[#074632]">Concluir</Button> : <Button onClick={nextRecipient} disabled={!currentRecorded || cooldown > 0} className="bg-[#0b553f] hover:bg-[#074632]">Próximo</Button>}</div></div>}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl border border-[#dfe8e2] bg-[#f8faf9] p-3 text-center"><strong className="block text-xl text-[#0b553f]">{value}</strong><span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-[#71827a]">{label}</span></div>;
}
