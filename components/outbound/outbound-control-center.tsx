"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { OverlayBackButton } from "@/components/overlay-back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useBackClosable } from "@/hooks/use-back-closable";

type QueueStatus = "pending" | "sending" | "sent" | "failed" | "unknown" | "canceled";
type MessageItem = {
  id: string;
  body: string;
  queue_status: QueueStatus;
  source: "single" | "quick" | "sequence" | "legacy" | null;
  attempt_count: number;
  scheduled_at: string | null;
  next_attempt_at: string | null;
  sent_at: string | null;
  created_at: string;
  provider_error_message: string | null;
  uncertainty_reason: string | null;
  retry_of: string | null;
  cancel_reason: string | null;
  contacts: { name: string } | null;
  whatsapp_connections: { name: string } | null;
};
type ConnectionHealth = {
  id: string;
  name: string;
  active: boolean;
  daily_limit: number;
  health_status: "unknown" | "ready" | "unavailable" | "error";
  health_error: string | null;
  health_checked_at: string | null;
  circuit_open_until: string | null;
  last_tested_at: string | null;
};
type LegacyHold = {
  id: string;
  legacy_due_at: string | null;
  contacts: { name: string } | null;
  sequences: { name: string } | null;
};
type OverviewPayload = {
  error?: string;
  messages?: MessageItem[];
  connections?: ConnectionHealth[];
  legacyHolds?: LegacyHold[];
};
type SettingsPayload = {
  error?: string;
  automaticSendingEnabled: boolean;
  pauseAll: boolean;
  timezone: string;
  defaultSendTime: string;
  safeWindowStart: string;
  safeWindowEnd: string;
  staleToleranceHours: number;
  hostConcurrencyLimit: number;
  perConnectionBatchLimit: number;
};

const initialSettings: SettingsPayload = {
  automaticSendingEnabled: false,
  pauseAll: false,
  timezone: "America/Sao_Paulo",
  defaultSendTime: "09:00",
  safeWindowStart: "08:00",
  safeWindowEnd: "20:00",
  staleToleranceHours: 12,
  hostConcurrencyLimit: 3,
  perConnectionBatchLimit: 3,
};
const statusLabels: Record<QueueStatus, string> = {
  pending: "Pendente",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  unknown: "Envio incerto",
  canceled: "Cancelada",
};
const statusStyles: Record<QueueStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  sending: "bg-blue-50 text-blue-700",
  sent: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  unknown: "bg-violet-50 text-violet-700",
  canceled: "bg-slate-100 text-slate-600",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function OutboundControlCenter() {
  const [settings, setSettings] = useState(initialSettings);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [connections, setConnections] = useState<ConnectionHealth[]>([]);
  const [legacyHolds, setLegacyHolds] = useState<LegacyHold[]>([]);
  const [filter, setFilter] = useState<"all" | QueueStatus>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageItem | null>(null);
  const detailsBack = useBackClosable(Boolean(selectedMessage), () => setSelectedMessage(null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResponse, overviewResponse] = await Promise.all([
        fetch("/api/outbound/settings", { cache: "no-store" }),
        fetch("/api/outbound/overview", { cache: "no-store" }),
      ]);
      const [settingsPayload, overviewPayload] = await Promise.all([
        settingsResponse.json() as Promise<SettingsPayload>,
        overviewResponse.json() as Promise<OverviewPayload>,
      ]);
      if (!settingsResponse.ok || !overviewResponse.ok) {
        throw new Error(settingsPayload.error || overviewPayload.error || "Não foi possível carregar os envios.");
      }
      setSettings(settingsPayload);
      setMessages(overviewPayload.messages || []);
      setConnections(overviewPayload.connections || []);
      setLegacyHolds(overviewPayload.legacyHolds || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os envios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredMessages = useMemo(
    () => messages.filter((message) => filter === "all" || message.queue_status === filter),
    [filter, messages],
  );
  const attentionCount = messages.filter((message) => message.queue_status === "failed" || message.queue_status === "unknown").length;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settings.safeWindowStart >= settings.safeWindowEnd) {
      return toast.error("O início da janela precisa ser anterior ao fim.");
    }
    setSaving(true);
    try {
      const response = await fetch("/api/outbound/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar as configurações.");
      toast.success("Configurações de envio salvas.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelMessage(id: string) {
    if (!window.confirm("Cancelar esta mensagem pendente?")) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/messages/${id}/cancel`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível cancelar a mensagem.");
      toast.success("Mensagem cancelada.");
      detailsBack.close();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cancelar a mensagem.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveUnknown(id: string, action: "resend" | "mark_sent") {
    if (action === "resend" && !window.confirm("A mensagem original pode ter sido entregue. Reenviar com uma nova chave mesmo assim?")) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/messages/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; warning?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível resolver o envio.");
      toast.success(action === "resend" ? "Reenvio criado com uma nova chave." : "Mensagem marcada como enviada.", {
        description: payload.warning,
      });
      detailsBack.close();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível resolver o envio.");
    } finally {
      setBusyId(null);
    }
  }

  async function rescheduleLegacy(id: string) {
    if (!window.confirm("Reagendar este passivo para a próxima janela segura? Nada será enviado imediatamente.")) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/outbound/legacy-hold/${id}/reschedule`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível reagendar o passivo.");
      toast.success("Passivo reagendado para a janela segura.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reagendar o passivo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#789087]">Operação</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-.035em]">Central de envios</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#71827a]">Acompanhe a fila, trate exceções e defina quando a automação pode trabalhar.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="grid min-h-64 place-items-center"><Loader2 className="size-7 animate-spin text-[#0b553f]" /></div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Pendentes" value={messages.filter((item) => item.queue_status === "pending").length} icon={Clock3} />
            <SummaryCard label="Precisam de ação" value={attentionCount} icon={ShieldAlert} danger={attentionCount > 0} />
            <SummaryCard label="Passivos retidos" value={legacyHolds.length} icon={Ban} danger={legacyHolds.length > 0} />
          </div>

          <form onSubmit={saveSettings} className="rounded-2xl border border-[#dfe8e2] bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3"><Settings2 className="size-5 text-[#0b553f]" /><div><h2 className="font-bold">Configurações de envio</h2><p className="text-xs text-[#71827a]">Horários são calculados no fuso escolhido e ajustados à janela segura.</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ToggleField label="Envio automático de cadências" detail="Mensagens rápidas continuam exigindo revisão." checked={settings.automaticSendingEnabled} disabled={settings.pauseAll} onChange={(value) => setSettings((current) => ({ ...current, automaticSendingEnabled: value }))} />
              <ToggleField label="Pausar todos os envios" detail="Bloqueia fila, cadências e envios manuais." checked={settings.pauseAll} danger onChange={(value) => setSettings((current) => ({ ...current, pauseAll: value }))} />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Fuso horário"><Input value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} /></Field>
              <Field label="Horário padrão"><Input type="time" value={settings.defaultSendTime} onChange={(event) => setSettings((current) => ({ ...current, defaultSendTime: event.target.value }))} /></Field>
              <Field label="Início da janela segura"><Input type="time" value={settings.safeWindowStart} onChange={(event) => setSettings((current) => ({ ...current, safeWindowStart: event.target.value }))} /></Field>
              <Field label="Fim da janela segura"><Input type="time" value={settings.safeWindowEnd} onChange={(event) => setSettings((current) => ({ ...current, safeWindowEnd: event.target.value }))} /></Field>
              <NumberField label="Tolerância de atraso (h)" value={settings.staleToleranceHours} min={1} max={168} onChange={(value) => setSettings((current) => ({ ...current, staleToleranceHours: value }))} />
              <NumberField label="Concorrência global por host" value={settings.hostConcurrencyLimit} min={1} max={50} onChange={(value) => setSettings((current) => ({ ...current, hostConcurrencyLimit: value }))} />
              <NumberField label="Lote por conexão" value={settings.perConnectionBatchLimit} min={1} max={50} onChange={(value) => setSettings((current) => ({ ...current, perConnectionBatchLimit: value }))} />
            </div>
            <div className="mt-5 flex justify-end"><Button type="submit" disabled={saving} className="bg-[#0b553f] hover:bg-[#074632]">{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar configurações</Button></div>
          </form>

          <section className="rounded-2xl border border-[#dfe8e2] bg-white p-5 sm:p-6">
            <h2 className="font-bold">Saúde das conexões</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {connections.map((connection) => {
                const unavailable = connection.health_status === "unavailable" || connection.health_status === "error";
                return <div key={connection.id} className="rounded-xl border border-[#e4ebe7] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{connection.name}</p><p className="mt-1 text-xs text-[#71827a]">Limite diário: {connection.daily_limit}</p></div><Badge className={unavailable ? "bg-red-50 text-red-700 hover:bg-red-50" : connection.health_status === "ready" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>{unavailable ? <WifiOff className="mr-1 size-3" /> : <CheckCircle2 className="mr-1 size-3" />}{connection.health_status === "ready" ? "Disponível" : connection.health_status === "unavailable" ? "Indisponível" : connection.health_status === "error" ? "Com erro" : "Não testada"}</Badge></div>{connection.health_error && <p className="mt-3 text-xs leading-5 text-red-700">{connection.health_error}</p>}{connection.circuit_open_until && new Date(connection.circuit_open_until) > new Date() && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Chamadas suspensas até {formatDate(connection.circuit_open_until)}. A fila permanece pendente sem consumir tentativa.</p>}</div>;
              })}
              {!connections.length && <p className="text-sm text-[#71827a]">Nenhuma conexão ZPRO cadastrada.</p>}
            </div>
          </section>

          {legacyHolds.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 sm:p-6"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" /><div><h2 className="font-bold text-amber-900">Passivos retidos para revisão</h2><p className="mt-1 text-xs leading-5 text-amber-800">Itens além da tolerância nunca são enviados automaticamente. Revise cada contato e reagende explicitamente para a próxima janela segura.</p></div></div><div className="mt-4 space-y-2">{legacyHolds.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{item.contacts?.name || "Contato"}</p><p className="mt-1 text-xs text-[#71827a]">{item.sequences?.name || "Cadência"} · venceu em {formatDate(item.legacy_due_at)}</p></div><Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void rescheduleLegacy(item.id)}>{busyId === item.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}Revisar e reagendar</Button></div>)}</div></section>}

          <section className="rounded-2xl border border-[#dfe8e2] bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold">Fila e falhas</h2><p className="mt-1 text-xs text-[#71827a]">Até 300 operações recentes, com tentativas e motivo técnico.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value as "all" | QueueStatus)} className="h-10 rounded-md border border-input bg-white px-3 text-sm"><option value="all">Todos os estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="mt-4 divide-y divide-[#e7ede9]">
              {filteredMessages.map((message) => <button key={message.id} onClick={() => setSelectedMessage(message)} className="flex w-full items-center gap-3 py-4 text-left"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#0b553f]"><Send className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{message.contacts?.name || "Contato"}</span><span className="mt-1 block truncate text-xs text-[#71827a]">{message.whatsapp_connections?.name || "Sem conexão"} · {formatDate(message.scheduled_at || message.created_at)} · {message.attempt_count} tentativa(s)</span></span><Badge className={statusStyles[message.queue_status]}>{statusLabels[message.queue_status]}</Badge></button>)}
              {!filteredMessages.length && <div className="py-12 text-center text-sm text-[#71827a]">Nenhuma operação neste filtro.</div>}
            </div>
          </section>
        </div>
      )}

      <Sheet open={Boolean(selectedMessage)} onOpenChange={detailsBack.onOpenChange}>
        <SheetContent showCloseButton={false} className="w-full overflow-y-auto sm:max-w-[480px]">
          <SheetHeader className="flex-row items-start border-b"><OverlayBackButton onClick={detailsBack.close} /><div className="min-w-0 pt-1"><SheetTitle>Detalhes do envio</SheetTitle><SheetDescription>Estado, tentativas e ações seguras para esta operação.</SheetDescription></div></SheetHeader>
          {selectedMessage && <div className="space-y-4 px-4 pb-8"><div className="flex items-center justify-between gap-3"><strong>{selectedMessage.contacts?.name || "Contato"}</strong><Badge className={statusStyles[selectedMessage.queue_status]}>{statusLabels[selectedMessage.queue_status]}</Badge></div><div className="rounded-xl bg-[#f3f7f4] p-4 text-sm leading-6 whitespace-pre-wrap">{selectedMessage.body}</div><dl className="divide-y divide-[#e7ede9] rounded-xl border border-[#e0e8e3]"><Detail label="Conexão" value={selectedMessage.whatsapp_connections?.name || "Sem conexão"} /><Detail label="Origem" value={selectedMessage.source || "—"} /><Detail label="Tentativas consumidas" value={String(selectedMessage.attempt_count)} /><Detail label="Agendada para" value={formatDate(selectedMessage.scheduled_at)} /><Detail label="Próxima tentativa" value={formatDate(selectedMessage.next_attempt_at)} /></dl>{(selectedMessage.provider_error_message || selectedMessage.uncertainty_reason) && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs leading-5 text-red-800">{selectedMessage.provider_error_message || selectedMessage.uncertainty_reason}</div>}{selectedMessage.queue_status === "pending" && <Button variant="outline" className="w-full border-red-200 text-red-700" disabled={busyId === selectedMessage.id} onClick={() => void cancelMessage(selectedMessage.id)}><Ban className="mr-2 size-4" />Cancelar mensagem</Button>}{selectedMessage.queue_status === "unknown" && <div className="space-y-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><strong className="block">Antes de reenviar</strong>A original pode ter sido entregue. O reenvio cria uma nova operação e uma nova chave, portanto pode gerar duplicidade.</div><div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={busyId === selectedMessage.id} onClick={() => void resolveUnknown(selectedMessage.id, "mark_sent")}>Marcar como enviada</Button><Button className="bg-[#0b553f] hover:bg-[#074632]" disabled={busyId === selectedMessage.id} onClick={() => void resolveUnknown(selectedMessage.id, "resend")}>Reenviar com nova chave</Button></div></div>}</div>}
          {selectedMessage && <div className="space-y-4 px-4 pb-8"><div className="flex items-center justify-between gap-3"><strong>{selectedMessage.contacts?.name || "Contato"}</strong><Badge className={statusStyles[selectedMessage.queue_status]}>{statusLabels[selectedMessage.queue_status]}</Badge></div><div className="rounded-xl bg-[#f3f7f4] p-4 text-sm leading-6 whitespace-pre-wrap">{selectedMessage.body}</div><dl className="divide-y divide-[#e7ede9] rounded-xl border border-[#e0e8e3]"><Detail label="Conexão" value={selectedMessage.whatsapp_connections?.name || "Sem conexão"} /><Detail label="Origem" value={selectedMessage.source || "—"} /><Detail label="Tentativas consumidas" value={String(selectedMessage.attempt_count)} /><Detail label="Agendada para" value={formatDate(selectedMessage.scheduled_at)} /><Detail label="Próxima tentativa" value={formatDate(selectedMessage.next_attempt_at)} /></dl>{(selectedMessage.provider_error_message || selectedMessage.uncertainty_reason) && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs leading-5 text-red-800">{selectedMessage.provider_error_message || selectedMessage.uncertainty_reason}</div>}{selectedMessage.queue_status === "pending" && <Button variant="outline" className="w-full border-red-200 text-red-700" disabled={busyId === selectedMessage.id} onClick={() => void cancelMessage(selectedMessage.id)}><Ban className="mr-2 size-4" />Cancelar mensagem</Button>}{selectedMessage.queue_status === "failed" && !selectedMessage.retry_of && !selectedMessage.cancel_reason && <div className="space-y-3"><p className="rounded-xl bg-[#f3f7f4] p-4 text-xs leading-5 text-[#4f675d]">Depois de corrigir a conexão ou o motivo da falha, você pode criar uma nova operação com uma nova chave.</p><Button className="w-full bg-[#0b553f] hover:bg-[#074632]" disabled={busyId === selectedMessage.id} onClick={() => void resolveUnknown(selectedMessage.id, "resend")}><RotateCcw className="mr-2 size-4" />Tentar novamente</Button></div>}{selectedMessage.queue_status === "unknown" && <div className="space-y-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><strong className="block">Antes de reenviar</strong>A original pode ter sido entregue. O reenvio cria uma nova operação e uma nova chave, portanto pode gerar duplicidade.</div><div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={busyId === selectedMessage.id} onClick={() => void resolveUnknown(selectedMessage.id, "mark_sent")}>Marcar como enviada</Button><Button className="bg-[#0b553f] hover:bg-[#074632]" disabled={busyId === selectedMessage.id} onClick={() => void resolveUnknown(selectedMessage.id, "resend")}>Reenviar com nova chave</Button></div></div>}</div>}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SummaryCard({ label, value, icon: Icon, danger = false }: { label: string; value: number; icon: typeof Clock3; danger?: boolean }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-[#dfe8e2] bg-white p-5"><span className={`grid size-11 place-items-center rounded-xl ${danger ? "bg-red-50 text-red-700" : "bg-[#e9f3d8] text-[#47701d]"}`}><Icon className="size-5" /></span><div><strong className="block text-2xl">{value}</strong><span className="text-xs text-[#71827a]">{label}</span></div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">{label}{children}</label>;
}
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <Field label={label}><Input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></Field>;
}
function ToggleField({ label, detail, checked, onChange, disabled = false, danger = false }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; danger?: boolean }) {
  return <label className={`flex items-center justify-between gap-4 rounded-xl p-4 text-sm font-semibold ${danger ? "bg-red-50 text-red-900" : "bg-[#f3f7f4]"}`}><span><span className="block">{label}</span><span className="mt-1 block text-xs font-normal opacity-70">{detail}</span></span><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></label>;
}
function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-xs text-[#71827a]">{label}</dt><dd className="text-right text-sm font-semibold">{value}</dd></div>;
}
