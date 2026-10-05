"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, Bell, CalendarClock, Check, ChevronRight, CircleHelp, Clock3, Copy, Inbox, LayoutDashboard, Loader2,
  Leaf, ListChecks, LogOut, MessageCircle, MoreHorizontal, Plus, Search, Send, Settings,
  Sparkles, Target, Trash2, TrendingUp, UserCog, UserRound, UsersRound, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { ProfileDialog, UserProfile } from "@/components/profile-dialog";
import { WhatsAppConnections } from "@/components/whatsapp-connections";
import { defaultSequence, Lead, LeadKind, LeadStatus, SequenceStep } from "@/lib/demo-data";

type View = "inicio" | "contatos" | "sequencias" | "conexoes";
type AppNotification = { id: string; title: string; detail: string; leadId?: string; urgent?: boolean };
type AppDataPayload = {
  error?: string;
  contacts?: Lead[];
  sequence?: { id: string; name: string; audience: string; pauseOnReply: boolean; steps: SequenceStep[] } | null;
};
type MutationPayload = { error?: string; id?: string };

const statusStyle: Record<LeadStatus, string> = {
  Novo: "bg-blue-50 text-blue-700 border-blue-100",
  "Em contato": "bg-amber-50 text-amber-700 border-amber-100",
  Respondeu: "bg-violet-50 text-violet-700 border-violet-100",
  Qualificado: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#b7e64a] text-[#063d2e] shadow-[0_8px_24px_rgba(6,61,46,.22)]"><Leaf className="size-5" /></span>{!compact && <div><strong className="block text-[17px] leading-5 tracking-tight text-white">Ninja Green</strong><span className="text-[11px] text-emerald-100/65">Follow-up inteligente</span></div>}</div>;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map((part) => part[0]).join("");
  return <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e5f2d0] text-xs font-bold text-[#25533d]">{initials}</span>;
}

function Status({ value }: { value: LeadStatus }) {
  return <Badge variant="outline" className={`rounded-full px-2.5 py-1 font-medium ${statusStyle[value]}`}>{value}</Badge>;
}

type NinjaGreenAppProps = {
  currentUser: { name: string; email: string };
  isAdmin: boolean;
  authEnabled: boolean;
};

export function NinjaGreenApp({ currentUser, isAdmin, authEnabled }: NinjaGreenAppProps) {
  const router = useRouter();
  const [view, setView] = useState<View>("inicio");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(currentUser);
  const [messageLead, setMessageLead] = useState<Lead | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"Todos" | LeadKind>("Todos");
  const [sequence, setSequence] = useState(defaultSequence);
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const [sequenceName, setSequenceName] = useState("Follow-up principal");
  const [sequenceAudience, setSequenceAudience] = useState("Todos os contatos");
  const [pauseOnReply, setPauseOnReply] = useState(true);
  const [dataLoading, setDataLoading] = useState(authEnabled);
  const [sequenceSaving, setSequenceSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const initials = profile.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const firstName = profile.name.split(" ")[0];

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    const refreshClock = () => setCurrentTime(Date.now());
    const initialTimer = window.setTimeout(refreshClock, 0);
    const interval = window.setInterval(refreshClock, 60_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(interval); };
  }, []);

  const loadData = useCallback(async () => {
    if (!authEnabled) {
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    try {
      const response = await fetch("/api/app-data", { cache: "no-store" });
      if (response.status === 401) return router.push("/login");
      const payload = await response.json() as AppDataPayload;
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar dados.");
      setLeads(payload.contacts || []);
      if (payload.sequence) {
        setSequenceId(payload.sequence.id);
        setSequenceName(payload.sequence.name);
        setSequenceAudience(payload.sequence.audience);
        setPauseOnReply(payload.sequence.pauseOnReply);
        setSequence(payload.sequence.steps?.length ? payload.sequence.steps : defaultSequence);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar seus dados.");
    } finally {
      setDataLoading(false);
    }
  }, [authEnabled, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const visibleLeads = useMemo(() => leads.filter((lead) => {
    const matchesKind = filter === "Todos" || lead.kind === filter;
    const term = search.toLowerCase();
    return matchesKind && `${lead.name} ${lead.phone} ${lead.interest}`.toLowerCase().includes(term);
  }), [leads, search, filter]);

  const notifications = useMemo<AppNotification[]>(() => {
    const items = leads.flatMap((lead) => {
      const result: AppNotification[] = [];
      if (currentTime !== null && lead.nextRunAt && new Date(lead.nextRunAt).getTime() <= currentTime) result.push({ id: `due-${lead.id}`, title: `Follow-up com ${lead.name}`, detail: lead.nextContact, leadId: lead.id, urgent: true });
      if (lead.status === "Respondeu") result.push({ id: `reply-${lead.id}`, title: `${lead.name} respondeu`, detail: "Abra o contato e dê continuidade à conversa.", leadId: lead.id, urgent: true });
      if (lead.status === "Novo" && !lead.lastContactAt) result.push({ id: `new-${lead.id}`, title: "Primeiro contato pendente", detail: `${lead.name} ainda não recebeu uma abordagem.`, leadId: lead.id });
      return result;
    });
    if (!leads.length && !dataLoading) items.push({ id: "empty", title: "Cadastre seu primeiro contato", detail: "Use o botão Novo contato para iniciar sua operação." });
    return items;
  }, [currentTime, dataLoading, leads]);

  function sendMessage(lead: Lead) {
    const template = sequence.find((step) => step.enabled)?.message || "Olá, {{nome}}! Tudo bem? Gostaria de conversar sobre {{interesse}}.";
    setMessageBody(template.replaceAll("{{nome}}", lead.name.split(" ")[0]).replaceAll("{{interesse}}", lead.interest));
    setMessageLead(lead);
  }

  async function addLead(lead: Lead) {
    const response = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
    const payload = await response.json().catch(() => ({})) as MutationPayload;
    if (!response.ok) return toast.error(payload.error || "Não foi possível cadastrar o contato.");
    setAddOpen(false);
    toast.success("Contato cadastrado", { description: "Os dados já estão salvos na sua conta." });
    await loadData();
  }

  async function saveSequence() {
    setSequenceSaving(true);
    try {
      const response = await fetch("/api/sequences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sequenceId, name: sequenceName, audience: sequenceAudience, pauseOnReply, steps: sequence }) });
      const payload = await response.json().catch(() => ({})) as MutationPayload;
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a cadência.");
      if (payload.id) setSequenceId(payload.id);
      toast.success("Cadência salva na sua conta");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a cadência.");
    } finally {
      setSequenceSaving(false);
    }
  }

  async function updateLeadStatus(lead: Lead, status: LeadStatus) {
    const response = await fetch(`/api/contacts/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const payload = await response.json().catch(() => ({})) as MutationPayload;
    if (!response.ok) return toast.error(payload.error || "Não foi possível atualizar o contato.");
    const updated = { ...lead, status };
    setSelected(updated);
    setLeads((items) => items.map((item) => item.id === lead.id ? updated : item));
    toast.success("Status atualizado");
  }

  async function deleteLead(lead: Lead) {
    if (!window.confirm(`Excluir ${lead.name}? Esta ação também remove o histórico associado.`)) return;
    const response = await fetch(`/api/contacts/${lead.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({})) as MutationPayload;
    if (!response.ok) return toast.error(payload.error || "Não foi possível excluir o contato.");
    setSelected(null);
    toast.success("Contato excluído");
    await loadData();
  }

  async function openWhatsApp() {
    if (!messageLead || !messageBody.trim()) return;
    const digits = messageLead.phone.replace(/\D/g, "");
    const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(messageBody.trim())}`, "_blank", "noopener,noreferrer");
    const lead = messageLead;
    setMessageLead(null);
    const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: lead.id, body: messageBody.trim() }) });
    if (!response.ok) toast.warning("O WhatsApp foi aberto, mas o histórico não pôde ser registrado.");
    else toast.success("WhatsApp aberto", { description: "A atividade foi registrada no histórico." });
    await loadData();
  }

  async function signOut() {
    if (!authEnabled) return toast.info("O login será ativado quando o Supabase for configurado.");
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[#f3f6f4] text-[#15372d]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col bg-[#063d2e] px-4 py-6 lg:flex">
        <div className="px-2"><Logo /></div>
        <nav className="mt-10 space-y-1.5">
          <Nav icon={LayoutDashboard} label="Visão geral" active={view === "inicio"} onClick={() => setView("inicio")} />
          <Nav icon={UsersRound} label="Contatos" active={view === "contatos"} onClick={() => setView("contatos")} count={leads.length} />
          <Nav icon={ListChecks} label="Sequências" active={view === "sequencias"} onClick={() => setView("sequencias")} />
          <Nav icon={MessageCircle} label="Conexões" active={view === "conexoes"} onClick={() => setView("conexoes")} />
          {isAdmin && <button onClick={() => router.push("/admin")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-emerald-50/65 transition hover:bg-white/[.06] hover:text-white"><UserCog className="size-[18px]" /><span>Usuários</span><Badge className="ml-auto bg-[#b7e64a] text-[#15372d] hover:bg-[#b7e64a]">Web</Badge></button>}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.06] p-4 text-white">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Zap className="size-4 text-[#b7e64a]" />Operação conectada</div>
          <p className="text-xs leading-5 text-emerald-50/65">Contatos, cadências e atividades são salvos com segurança na sua conta.</p>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/[.05] p-2.5 text-white"><button onClick={() => setProfileOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#b7e64a] text-xs font-bold text-[#063d2e]">{initials}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{profile.name}</span><span className="block truncate text-[11px] text-emerald-50/50">{profile.email}</span></span></button>{authEnabled && <button onClick={signOut} aria-label="Sair" className="rounded-lg p-2 text-emerald-50/60 hover:bg-white/10 hover:text-white"><LogOut className="size-4" /></button>}</div>
      </aside>

      <main className="min-h-screen pb-24 lg:ml-[236px] lg:pb-8">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#dfe8e2] bg-[#f3f6f4]/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="lg:hidden"><Logo compact /></div>
          <div className="hidden lg:block"><span className="text-sm text-[#6d7f77]">Ninja Green · sua operação comercial</span></div>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => setView("conexoes")} variant="ghost" size="icon" aria-label="Configurar conexões WhatsApp" className="rounded-full text-[#4f675d]"><Settings className="size-5" /></Button>
            <div className="relative"><Button onClick={() => setNotificationsOpen(true)} variant="ghost" size="icon" aria-label="Abrir notificações" className="rounded-full text-[#4f675d]"><Bell className="size-5" /></Button>{notifications.length > 0 && <span className="absolute right-0 top-0 grid size-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">{Math.min(notifications.length, 9)}</span>}</div>
            <button onClick={() => setProfileOpen(true)} aria-label="Editar perfil" className="ml-1 flex items-center gap-2 rounded-full bg-white p-1 pr-3 shadow-sm"><span className="grid size-8 place-items-center rounded-full bg-[#0b553f] text-xs font-bold text-white">{initials}</span><span className="hidden text-sm font-semibold sm:block">{firstName}</span></button>
          </div>
        </header>

        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
          {view === "inicio" && <Dashboard leads={leads} loading={dataLoading} currentTime={currentTime} userName={firstName} onAdd={() => setAddOpen(true)} onSelect={setSelected} onSend={sendMessage} onViewContacts={() => setView("contatos")} />}
          {view === "contatos" && <Contacts leads={visibleLeads} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onAdd={() => setAddOpen(true)} onSelect={setSelected} />}
          {view === "sequencias" && <Sequences steps={sequence} setSteps={setSequence} name={sequenceName} setName={setSequenceName} audience={sequenceAudience} setAudience={setSequenceAudience} pauseOnReply={pauseOnReply} setPauseOnReply={setPauseOnReply} onSave={saveSequence} saving={sequenceSaving} />}
          {view === "conexoes" && <WhatsAppConnections />}
        </div>
      </main>

      <MobileNav view={view} setView={setView} onAdd={() => setAddOpen(true)} onProfile={() => setProfileOpen(true)} />
      <AddLeadDialog open={addOpen} setOpen={setAddOpen} onAdd={addLead} />
      <LeadSheet lead={selected} onClose={() => setSelected(null)} onSend={sendMessage} onStatusChange={updateLeadStatus} onDelete={deleteLead} />
      <NotificationsSheet open={notificationsOpen} onClose={() => setNotificationsOpen(false)} notifications={notifications} onSelect={(item) => { setNotificationsOpen(false); if (item.leadId) setSelected(leads.find((lead) => lead.id === item.leadId) || null); else setAddOpen(true); }} />
      <MessageDialog lead={messageLead} body={messageBody} setBody={setMessageBody} onClose={() => setMessageLead(null)} onConfirm={openWhatsApp} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} profile={profile} onUpdated={setProfile} />
      <Toaster richColors position="top-center" />
    </div>
  );
}

function Nav({ icon: Icon, label, active, onClick, count }: { icon: typeof LayoutDashboard; label: string; active: boolean; onClick: () => void; count?: number }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${active ? "bg-white/10 text-white" : "text-emerald-50/65 hover:bg-white/[.06] hover:text-white"}`}><Icon className={`size-[18px] ${active ? "text-[#b7e64a]" : ""}`} /><span>{label}</span>{count !== undefined && <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{count}</span>}</button>;
}

function MobileNav({ view, setView, onAdd, onProfile }: { view: View; setView: (v: View) => void; onAdd: () => void; onProfile: () => void }) {
  return <nav className="fixed inset-x-0 bottom-0 z-30 grid h-[74px] grid-cols-5 items-center border-t border-[#dbe6df] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(20,55,45,.08)] backdrop-blur-xl lg:hidden">
    <MobileItem icon={LayoutDashboard} label="Início" active={view === "inicio"} onClick={() => setView("inicio")} />
    <MobileItem icon={UsersRound} label="Contatos" active={view === "contatos"} onClick={() => setView("contatos")} />
    <button onClick={onAdd} aria-label="Novo contato" className="mx-auto grid size-12 -translate-y-3 place-items-center rounded-2xl bg-[#93c83e] text-[#063d2e] shadow-[0_10px_24px_rgba(79,126,25,.28)]"><Plus className="size-6" /></button>
    <MobileItem icon={ListChecks} label="Cadência" active={view === "sequencias"} onClick={() => setView("sequencias")} />
    <MobileItem icon={UserRound} label="Perfil" active={false} onClick={onProfile} />
  </nav>;
}

function MobileItem({ icon: Icon, label, active, onClick }: { icon: typeof LayoutDashboard; label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex flex-col items-center gap-1 text-[10px] font-medium ${active ? "text-[#0b553f]" : "text-[#7a8b84]"}`}><Icon className="size-5" />{label}</button>;
}

function Dashboard({ leads, loading, currentTime, userName, onAdd, onSelect, onSend, onViewContacts }: { leads: Lead[]; loading: boolean; currentTime: number | null; userName: string; onAdd: () => void; onSelect: (l: Lead) => void; onSend: (l: Lead) => void; onViewContacts: () => void }) {
  const dueToday = currentTime === null ? 0 : leads.filter((lead) => lead.nextRunAt && new Date(lead.nextRunAt).getTime() <= currentTime).length;
  const replies = leads.filter((lead) => lead.status === "Respondeu").length;
  const qualified = leads.filter((lead) => lead.status === "Qualificado").length;
  const conversion = leads.length ? Math.round((qualified / leads.length) * 100) : 0;
  const statusCount = (status: LeadStatus) => leads.filter((lead) => lead.status === status).length;
  const recent = leads.flatMap((lead) => (lead.history || []).map((item) => ({ ...item, name: lead.name }))).slice(0, 2);
  return <>
    <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#6f8179]"><Sparkles className="size-4 text-[#7da62d]" />Seu dia comercial</p><h1 className="text-3xl font-bold tracking-[-.04em] text-[#123c2f] sm:text-4xl">Olá, {userName}.</h1><p className="mt-2 text-sm text-[#6d7f77] sm:text-base">Você tem <strong className="text-[#0b553f]">{dueToday} {dueToday === 1 ? "oportunidade" : "oportunidades"}</strong> pedindo atenção agora.</p></div>
      <Button onClick={onAdd} className="h-12 rounded-xl bg-[#0b553f] px-5 text-white shadow-[0_8px_22px_rgba(11,85,63,.2)] hover:bg-[#074632]"><Plus className="mr-2 size-5" />Novo contato</Button>
    </section>

    <section className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric icon={UsersRound} label="Em acompanhamento" value={String(leads.length)} note="Contatos reais da sua conta" />
      <Metric icon={CalendarClock} label="Follow-ups pendentes" value={String(dueToday)} note="Agendamentos vencidos ou para hoje" accent />
      <Metric icon={MessageCircle} label="Respostas" value={String(replies)} note="Contatos marcados como respondidos" />
      <Metric icon={Target} label="Qualificação" value={`${conversion}%`} note={`${qualified} contatos qualificados`} />
    </section>

    <section className="mt-6 grid gap-5 xl:grid-cols-[1.45fr_.85fr]">
      <div className="rounded-2xl border border-[#dfe8e2] bg-white shadow-[0_10px_40px_rgba(18,60,47,.05)]">
        <div className="flex items-center justify-between border-b border-[#e7ede9] p-5 sm:p-6"><div><h2 className="font-bold text-[#173d31]">Prioridades de hoje</h2><p className="mt-1 text-xs text-[#778780]">Contatos ordenados pelo melhor momento de agir</p></div><Button variant="ghost" size="sm" onClick={onViewContacts} className="text-[#0b553f]">Ver todos</Button></div>
        <div className="divide-y divide-[#edf1ef]">{loading && <div className="grid place-items-center py-16 text-[#71827a]"><Loader2 className="mb-3 size-6 animate-spin" /><span className="text-sm">Carregando sua operação…</span></div>}{!loading && leads.slice(0, 3).map((lead, index) => <div key={lead.id} className="flex items-center gap-3 p-4 sm:px-6 sm:py-5"><div className="hidden w-5 text-xs font-bold text-[#9baaA3] sm:block">0{index + 1}</div><Avatar name={lead.name} /><button onClick={() => onSelect(lead)} className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-bold text-[#173d31]">{lead.name}</div><div className="mt-1 flex items-center gap-2 text-xs text-[#73847c]"><span>{lead.kind}</span><span>·</span><span className="truncate">{lead.interest}</span></div></button><div className="hidden text-right sm:block"><div className="text-xs font-semibold text-[#173d31]">{lead.nextContact}</div><div className="mt-1"><Status value={lead.status} /></div></div><Button onClick={() => onSend(lead)} size="icon" variant="ghost" aria-label={`Enviar mensagem para ${lead.name}`} className="rounded-full bg-[#eaf4e3] text-[#397138] hover:bg-[#dceecd]"><Send className="size-4" /></Button></div>)}{!loading && leads.length === 0 && <div className="px-6 py-14 text-center"><Inbox className="mx-auto mb-3 size-8 text-[#9aaaA3]" /><p className="font-semibold">Sua operação começa aqui</p><p className="mt-1 text-sm text-[#75867e]">Cadastre o primeiro contato para alimentar o painel.</p></div>}</div>
      </div>
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#0a4938] p-6 text-white shadow-[0_14px_34px_rgba(6,61,46,.17)]"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#b7e64a]">Pulso do funil</p><h2 className="mt-2 text-xl font-bold">Oportunidades ativas</h2></div><TrendingUp className="size-6 text-[#b7e64a]" /></div><div className="mt-6 space-y-4"><Funnel label="Novos" value={statusCount("Novo")} width={`${leads.length ? Math.max(8, statusCount("Novo") / leads.length * 100) : 0}%`} /><Funnel label="Em contato" value={statusCount("Em contato")} width={`${leads.length ? Math.max(8, statusCount("Em contato") / leads.length * 100) : 0}%`} /><Funnel label="Qualificados" value={qualified} width={`${leads.length ? Math.max(8, qualified / leads.length * 100) : 0}%`} /></div></div>
        <div className="rounded-2xl border border-[#dfe8e2] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-bold">Atividade recente</h2><Clock3 className="size-4 text-[#8a9a93]" /></div><div className="mt-4 space-y-4">{recent.map((item) => <Activity key={item.id} name={`${item.name}: ${item.title}`} detail={item.detail} />)}{recent.length === 0 && <p className="py-5 text-center text-xs text-[#7e8d86]">As conversas registradas aparecerão aqui.</p>}</div></div>
      </div>
    </section>
  </>;
}

function Metric({ icon: Icon, label, value, note, accent }: { icon: typeof UsersRound; label: string; value: string; note: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-4 sm:p-5 ${accent ? "border-[#cfe0ae] bg-[#eef7dd]" : "border-[#dfe8e2] bg-white"}`}><div className="flex items-center justify-between"><span className={`grid size-9 place-items-center rounded-xl ${accent ? "bg-[#d9edb4] text-[#456f16]" : "bg-[#edf3ef] text-[#477061]"}`}><Icon className="size-[18px]" /></span><MoreHorizontal className="size-4 text-[#9aaaA3]" /></div><div className="mt-5 text-2xl font-extrabold tracking-tight sm:text-3xl">{value}</div><div className="mt-1 text-xs font-semibold text-[#536b61] sm:text-sm">{label}</div><div className="mt-2 hidden text-[11px] text-[#809087] sm:block">{note}</div></div>;
}

function Funnel({ label, value, width }: { label: string; value: number; width: string }) { return <div><div className="mb-1.5 flex justify-between text-xs text-emerald-50/75"><span>{label}</span><b className="text-white">{value}</b></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#b7e64a]" style={{ width }} /></div></div>; }
function Activity({ name, detail }: { name: string; detail: string }) { return <div className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#93c83e] ring-4 ring-[#edf6e5]" /><div><p className="text-xs font-bold text-[#25483c]">{name}</p><p className="mt-0.5 text-[11px] text-[#7e8d86]">{detail}</p></div></div>; }

function Contacts({ leads, search, setSearch, filter, setFilter, onAdd, onSelect }: { leads: Lead[]; search: string; setSearch: (v: string) => void; filter: "Todos" | LeadKind; setFilter: (v: "Todos" | LeadKind) => void; onAdd: () => void; onSelect: (l: Lead) => void }) {
  return <><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#789087]">Relacionamento</p><h1 className="mt-1 text-3xl font-bold tracking-[-.035em]">Seus contatos</h1><p className="mt-2 text-sm text-[#71827a]">Tudo o que você precisa para não perder uma oportunidade.</p></div><Button onClick={onAdd} className="hidden h-11 rounded-xl bg-[#0b553f] sm:flex"><Plus className="mr-2 size-4" />Novo contato</Button></div>
  <div className="mt-7 rounded-2xl border border-[#dfe8e2] bg-white p-4 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative flex-1 sm:max-w-md"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#82928b]" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou interesse" className="h-11 rounded-xl border-[#dce6e0] bg-[#f8faf9] pl-10" /></div><div className="flex gap-2">{(["Todos", "Cliente", "Licenciado"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${filter === item ? "border-[#0b553f] bg-[#0b553f] text-white" : "border-[#dfe8e2] text-[#61756c]"}`}>{item}</button>)}</div></div>
  <div className="mt-5 divide-y divide-[#edf1ef]">{leads.map((lead) => <button key={lead.id} onClick={() => onSelect(lead)} className="flex w-full items-center gap-3 py-4 text-left hover:bg-[#f8faf8] sm:px-2"><Avatar name={lead.name} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{lead.name}</div><div className="mt-1 truncate text-xs text-[#77877f]">{lead.phone} · {lead.interest}</div></div><div className="hidden sm:block"><Status value={lead.status} /></div><div className="hidden w-28 text-right text-xs text-[#65786f] md:block">{lead.nextContact}</div><ChevronRight className="size-4 text-[#9babA4]" /></button>)}{leads.length === 0 && <div className="py-16 text-center text-sm text-[#7a8a83]">Nenhum contato encontrado.</div>}</div></div></>;
}

type SequenceProps = {
  steps: SequenceStep[];
  setSteps: (steps: SequenceStep[]) => void;
  name: string;
  setName: (name: string) => void;
  audience: string;
  setAudience: (audience: string) => void;
  pauseOnReply: boolean;
  setPauseOnReply: (pause: boolean) => void;
  onSave: () => void;
  saving: boolean;
};

function Sequences({ steps, setSteps, name, setName, audience, setAudience, pauseOnReply, setPauseOnReply, onSave, saving }: SequenceProps) {
  const updateStep = (id: string, patch: Partial<SequenceStep>) => setSteps(steps.map((step) => step.id === id ? { ...step, ...patch } : step));
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  };
  const addStep = () => {
    const lastDelay = steps.at(-1)?.delayDays ?? 0;
    setSteps([...steps, { id: crypto.randomUUID(), delayDays: Math.max(lastDelay + 3, 3), title: "Novo follow-up", message: "Escreva aqui o objetivo desta mensagem", enabled: true }]);
    toast.success("Nova etapa adicionada");
  };
  const duplicateStep = (step: SequenceStep, index: number) => {
    const next = [...steps];
    next.splice(index + 1, 0, { ...step, id: crypto.randomUUID(), title: `${step.title} (cópia)` });
    setSteps(next);
  };
  const removeStep = (id: string) => {
    if (steps.length === 1) return toast.error("A sequência precisa ter pelo menos uma etapa.");
    setSteps(steps.filter((step) => step.id !== id));
    toast.info("Etapa removida");
  };
  const resetSequence = () => {
    setSteps(defaultSequence.map((step) => ({ ...step })));
    setName("Follow-up principal");
    setAudience("Todos os contatos");
    setPauseOnReply(true);
    toast.success("Sequência padrão restaurada");
  };

  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-[#789087]">Automação</p><h1 className="mt-1 text-3xl font-bold tracking-[-.035em]">Cadência de follow-up</h1><p className="mt-2 max-w-2xl text-sm text-[#71827a]">Defina livremente quando e como cada contato será retomado.</p></div>
      <Button type="button" onClick={onSave} disabled={saving} className="bg-[#0b553f] hover:bg-[#074632]">{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}Salvar cadência</Button>
    </div>

    <div className="mt-7 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-[#dfe8e2] bg-white p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <Field label="Nome da sequência"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Aplicar para"><select value={audience} onChange={(event) => setAudience(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option>Todos os contatos</option><option>Somente clientes</option><option>Somente licenciados</option></select></Field>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f3f7f4] p-4">
            <div><p className="text-sm font-bold">Pausar quando o contato responder</p><p className="mt-1 text-xs text-[#71837a]">Evita mensagens automáticas depois que a conversa começou.</p></div>
            <Switch checked={pauseOnReply} onCheckedChange={setPauseOnReply} />
          </div>
        </section>

        <section className="rounded-2xl border border-[#dfe8e2] bg-white p-5 sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-3"><div><h2 className="font-bold">Etapas da sequência</h2><p className="mt-1 text-xs text-[#7a8b83]">Edite os dias, o objetivo e a ordem de cada contato</p></div><Badge className="rounded-full bg-[#e7f3d2] text-[#436b21] hover:bg-[#e7f3d2]">{steps.filter((step) => step.enabled).length} ativas</Badge></div>
          <div>{steps.map((step, index) => <div key={step.id} className="relative flex gap-3 pb-5 last:pb-0 sm:gap-4">{index < steps.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-18px)] w-px bg-[#dce6e0]" />}<span className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${step.enabled ? "bg-[#0b553f] text-white" : "bg-[#e9eeeb] text-[#87968f]"}`}>{index + 1}</span><div className="min-w-0 flex-1 rounded-xl border border-[#e4ebe7] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="text-xs font-semibold text-[#61766c]">Enviar após</span><Input aria-label={`Dias da etapa ${index + 1}`} type="number" min={0} max={365} value={step.delayDays} onChange={(event) => updateStep(step.id, { delayDays: Math.max(0, Number(event.target.value)) })} className="h-8 w-20 text-center font-bold text-[#0b553f]" /><span className="text-xs font-semibold text-[#61766c]">{step.delayDays === 1 ? "dia" : "dias"}</span></div><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" aria-label="Mover etapa para cima" disabled={index === 0} onClick={() => moveStep(index, -1)} className="size-8"><ArrowUp className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Mover etapa para baixo" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} className="size-8"><ArrowDown className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Duplicar etapa" onClick={() => duplicateStep(step, index)} className="size-8"><Copy className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Remover etapa" onClick={() => removeStep(step.id)} className="size-8 text-red-500 hover:text-red-600"><Trash2 className="size-4" /></Button><Switch aria-label={`Ativar etapa ${index + 1}`} checked={step.enabled} onCheckedChange={(enabled) => updateStep(step.id, { enabled })} /></div></div><div className="mt-4 grid gap-3"><Field label="Objetivo desta etapa"><Input value={step.title} onChange={(event) => updateStep(step.id, { title: event.target.value })} /></Field><Field label="Orientação da mensagem"><Textarea value={step.message} onChange={(event) => updateStep(step.id, { message: event.target.value })} className="min-h-16 resize-y" /></Field></div></div></div>)}</div>
          <div className="mt-6 flex flex-col gap-2 border-t border-[#e8eeea] pt-5 sm:flex-row sm:justify-between"><Button type="button" variant="outline" onClick={resetSequence}>Restaurar padrão</Button><div className="flex gap-2"><Button type="button" onClick={addStep} variant="outline"><Plus className="mr-2 size-4" />Adicionar etapa</Button><Button type="button" onClick={onSave} disabled={saving} className="bg-[#0b553f] hover:bg-[#074632]">Salvar alterações</Button></div></div>
        </section>
      </div>

      <aside className="h-fit rounded-2xl bg-[#0a4938] p-6 text-white"><MessageCircle className="size-7 text-[#b7e64a]" /><h2 className="mt-5 text-lg font-bold">Regras adaptáveis</h2><p className="mt-2 text-sm leading-6 text-emerald-50/70">A cadência fica vinculada à sua conta e pode ser alterada sempre que a operação mudar.</p><div className="mt-5 rounded-xl bg-white/[.07] p-4 text-xs leading-5 text-emerald-50/70"><strong className="mb-1 block text-white">Como os dias funcionam</strong>Zero agenda para o mesmo dia. Os demais valores contam a partir do cadastro do contato.</div><div className="mt-3 rounded-xl bg-white/[.07] p-4 text-xs leading-5 text-emerald-50/70"><strong className="mb-1 block text-white">WhatsApp disponível agora</strong>O sistema abre a conversa com a mensagem preenchida e registra a atividade. O envio automático entra quando a UazAPI for conectada.</div></aside>
    </div>
  </>;
}

function AddLeadDialog({ open, setOpen, onAdd }: { open: boolean; setOpen: (v: boolean) => void; onAdd: (l: Lead) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") || "").trim(); const phone = String(data.get("phone") || "").trim(); if (!name || !phone) return toast.error("Preencha nome e WhatsApp.");
    onAdd({ id: crypto.randomUUID(), name, phone, email: String(data.get("email") || ""), kind: String(data.get("kind")) as LeadKind, interest: String(data.get("interest") || "Ainda não informado"), origin: String(data.get("origin") || "Cadastro manual"), status: "Novo", nextContact: "Agora", lastContact: "Ainda não contatada", note: String(data.get("note") || "") }); event.currentTarget.reset();
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-[560px]"><DialogHeader><div className="mb-2 grid size-11 place-items-center rounded-xl bg-[#e6f2d3] text-[#44701b]"><UserRound className="size-5" /></div><DialogTitle className="text-xl">Novo contato</DialogTitle><DialogDescription>Cadastre o essencial agora. Você completa o restante depois.</DialogDescription></DialogHeader><form onSubmit={submit} className="mt-2 grid gap-4 sm:grid-cols-2"><Field label="Nome *"><Input name="name" placeholder="Nome ou empresa" /></Field><Field label="WhatsApp *"><Input name="phone" inputMode="tel" placeholder="(00) 00000-0000" /></Field><Field label="E-mail"><Input name="email" type="email" placeholder="email@exemplo.com" /></Field><Field label="Origem"><Input name="origin" placeholder="Ex.: Mutirão Centro" /></Field><Field label="Objetivo"><select name="kind" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option>Cliente</option><option>Licenciado</option></select></Field><Field label="Interesse"><select name="interest" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option>Economia na conta de luz</option><option>Conexão residencial</option><option>Conexão empresarial</option><option>Conhecer o modelo de negócio</option><option>Renda complementar</option></select></Field><div className="sm:col-span-2"><Field label="Observação"><Textarea name="note" placeholder="Algo importante para personalizar o próximo contato…" className="min-h-20" /></Field></div><label className="flex items-start gap-3 rounded-xl bg-[#f3f7f4] p-3 text-xs leading-5 text-[#61746b] sm:col-span-2"><input type="checkbox" required className="mt-1 accent-[#0b553f]" /><span>Confirmo que este contato autorizou receber comunicações pelo WhatsApp.</span></label><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" className="bg-[#0b553f] hover:bg-[#074632]"><Check className="mr-2 size-4" />Cadastrar contato</Button></div></form></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">{label}{children}</label>; }

function LeadSheet({ lead, onClose, onSend, onStatusChange, onDelete }: { lead: Lead | null; onClose: () => void; onSend: (l: Lead) => void; onStatusChange: (lead: Lead, status: LeadStatus) => void; onDelete: (lead: Lead) => void }) {
  if (!lead) return null;
  const timeline = lead.history?.length ? lead.history : [{ id: "created", title: "Contato cadastrado", detail: lead.origin, time: lead.createdAt ? new Date(lead.createdAt).toLocaleString("pt-BR") : "Agora" }];
  return <Sheet open={!!lead} onOpenChange={(open) => !open && onClose()}><SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[460px]"><div className="bg-[#083f31] p-7 text-white"><SheetHeader><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-full bg-[#b7e64a] text-base font-bold text-[#063d2e]">{lead.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}</span><div><SheetTitle className="text-left text-xl text-white">{lead.name}</SheetTitle><SheetDescription className="mt-1 text-left text-emerald-50/65">{lead.kind} · {lead.origin}</SheetDescription></div></div></SheetHeader></div><div className="space-y-6 p-6"><div className="flex items-center justify-between gap-3"><select aria-label="Status do contato" value={lead.status} onChange={(event) => onStatusChange(lead, event.target.value as LeadStatus)} className="h-9 rounded-full border border-[#dbe6df] bg-white px-3 text-xs font-semibold text-[#315448]"><option>Novo</option><option>Em contato</option><option>Respondeu</option><option>Qualificado</option></select><span className="text-xs font-semibold text-[#667970]">Próximo: {lead.nextContact}</span></div><Button onClick={() => onSend(lead)} className="h-12 w-full rounded-xl bg-[#22a568] hover:bg-[#198a56]"><MessageCircle className="mr-2 size-5" />Abrir conversa no WhatsApp</Button><section><h3 className="text-xs font-bold uppercase tracking-[.12em] text-[#83928b]">Informações</h3><div className="mt-3 divide-y divide-[#e8eeea] rounded-xl border border-[#e1e9e4]"><Info label="WhatsApp" value={lead.phone} /><Info label="E-mail" value={lead.email || "Não informado"} /><Info label="Interesse" value={lead.interest} /></div></section><section><h3 className="text-xs font-bold uppercase tracking-[.12em] text-[#83928b]">Histórico</h3><div className="mt-4 space-y-5">{timeline.map((item) => <div key={item.id} className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-[#93c83e] ring-4 ring-[#edf6e5]" /><div><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-[#75867e]">{item.detail}</p><p className="mt-1 text-[11px] text-[#9aa7a1]">{item.time}</p></div></div>)}</div></section>{lead.note && <section className="rounded-xl bg-[#f2f6f3] p-4"><div className="mb-1 flex items-center gap-2 text-xs font-bold"><CircleHelp className="size-4" />Observação</div><p className="text-sm text-[#61736b]">{lead.note}</p></section>}<Button variant="outline" onClick={() => onDelete(lead)} className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 className="mr-2 size-4" />Excluir contato</Button></div></SheetContent></Sheet>;
}

function NotificationsSheet({ open, onClose, notifications, onSelect }: { open: boolean; onClose: () => void; notifications: AppNotification[]; onSelect: (item: AppNotification) => void }) {
  return <Sheet open={open} onOpenChange={(value) => !value && onClose()}><SheetContent className="w-full sm:max-w-[420px]"><SheetHeader><SheetTitle>Notificações</SheetTitle><SheetDescription>Follow-ups e oportunidades que precisam da sua atenção.</SheetDescription></SheetHeader><div className="mt-6 space-y-3">{notifications.map((item) => <button key={item.id} onClick={() => onSelect(item)} className="flex w-full gap-3 rounded-xl border border-[#e1e9e4] p-4 text-left transition hover:bg-[#f5f8f6]"><span className={`mt-1 size-2.5 shrink-0 rounded-full ${item.urgent ? "bg-amber-500" : "bg-[#93c83e]"}`} /><span><strong className="block text-sm text-[#23483b]">{item.title}</strong><span className="mt-1 block text-xs leading-5 text-[#71827a]">{item.detail}</span></span></button>)}{notifications.length === 0 && <div className="rounded-xl bg-[#f3f7f4] px-5 py-10 text-center"><Check className="mx-auto size-7 text-[#62a02b]" /><p className="mt-3 text-sm font-bold">Tudo em dia</p><p className="mt-1 text-xs text-[#74867e]">Nenhuma ação pendente agora.</p></div>}</div></SheetContent></Sheet>;
}
function MessageDialog({ lead, body, setBody, onClose, onConfirm }: { lead: Lead | null; body: string; setBody: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={!!lead} onOpenChange={(open) => !open && onClose()}><DialogContent className="rounded-2xl sm:max-w-[540px]"><DialogHeader><DialogTitle>Mensagem para {lead?.name}</DialogTitle><DialogDescription>Revise o texto antes de abrir a conversa no WhatsApp.</DialogDescription></DialogHeader><Textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-40 resize-y" /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={onConfirm} disabled={!body.trim()} className="bg-[#22a568] hover:bg-[#198a56]"><Send className="mr-2 size-4" />Abrir WhatsApp</Button></div></DialogContent></Dialog>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 px-4 py-3"><span className="text-xs text-[#7b8b84]">{label}</span><span className="text-right text-sm font-semibold">{value}</span></div>; }
