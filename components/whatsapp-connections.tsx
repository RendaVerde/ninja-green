"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleOff, Info, LoaderCircle, MessageCircle, Pencil, Plus, Trash2, UserRoundPlus, UsersRound, Webhook, Wifi } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useBackClosable } from "@/hooks/use-back-closable";
import { maskZproApiId, parseZproConnectionAddress } from "@/lib/whatsapp/zpro-connection";

type Provider = "uazapi" | "baileys" | "evolution" | "evolution_go" | "zpro";
type Attendant = { id: string; profileName: string; email: string; role: "attendant" | "manager"; linked: boolean };
type Connection = { id: string; name: string; provider: Provider; endpointUrl: string; endpointConfigured: boolean; instanceName: string; apiIdMasked: string; channelId: number | null; active: boolean; owner: boolean; hasToken: boolean; attendants: Attendant[] };
const providerLabels: Record<Provider, string> = { uazapi: "UazApi", baileys: "Baileys", evolution: "Evolution", evolution_go: "Evolution GO", zpro: "ZPRO" };

export function WhatsAppConnections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [provider, setProvider] = useState<Provider>("uazapi");
  const [active, setActive] = useState(true);
  const [attendantConnection, setAttendantConnection] = useState<Connection | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [apiId, setApiId] = useState("");
  const [channelHelpOpen, setChannelHelpOpen] = useState(false);
  const channelHelpHoverTimer = useRef<number | null>(null);
  const channelHelpBack = useBackClosable(channelHelpOpen, () => setChannelHelpOpen(false));

  function openChannelHelpOnHover() {
    if (channelHelpHoverTimer.current) window.clearTimeout(channelHelpHoverTimer.current);
    channelHelpHoverTimer.current = window.setTimeout(() => setChannelHelpOpen(true), 150);
  }

  function closeChannelHelpOnHover() {
    if (channelHelpHoverTimer.current) window.clearTimeout(channelHelpHoverTimer.current);
    channelHelpHoverTimer.current = null;
    if (channelHelpOpen) channelHelpBack.close();
  }

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/whatsapp-connections", { cache: "no-store" });
      const result = await response.json() as { error?: string; connections?: Connection[] };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as conexões.");
      setConnections(result.connections || []);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar as conexões."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void loadConnections(), 0); return () => window.clearTimeout(timer); }, [loadConnections]);
  useEffect(() => () => {
    if (channelHelpHoverTimer.current) window.clearTimeout(channelHelpHoverTimer.current);
  }, []);

  function openCreate() { setEditing(null); setProvider("uazapi"); setActive(true); setEndpointUrl(""); setApiId(""); setDialogOpen(true); }
  function openEdit(connection: Connection) { setEditing(connection); setProvider(connection.provider); setActive(connection.active); setEndpointUrl(connection.provider === "zpro" ? "" : connection.endpointUrl); setApiId(""); setDialogOpen(true); }

  function updateEndpointUrl(value: string) {
    setEndpointUrl(value);
    if (provider !== "zpro" || !value) return;
    try {
      const address = parseZproConnectionAddress(value);
      if (address.extractedApiId) setApiId(address.apiId);
    } catch {
      // A API exibe a validação definitiva ao salvar.
    }
  }

  let endpointPreview = "";
  if (provider === "zpro" && endpointUrl) {
    try {
      const address = parseZproConnectionAddress(endpointUrl, apiId);
      const maskedApiId = address.apiId ? maskZproApiId(address.apiId) : editing?.apiIdMasked;
      if (maskedApiId) endpointPreview = `${address.baseUrl}/v2/api/external/${maskedApiId}`;
    } catch {
      endpointPreview = "";
    }
  }

  async function saveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(editing ? `/api/whatsapp-connections/${editing.id}` : "/api/whatsapp-connections", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), provider, endpointUrl: data.get("endpointUrl"), instanceName: data.get("instanceName"), apiToken: data.get("apiToken"), channelId: data.get("channelId"), active, attendants: [] }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a conexão.");
      setDialogOpen(false); toast.success(editing ? "Conexão atualizada" : "Conexão criada"); await loadConnections();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível salvar a conexão."); }
    finally { setSaving(false); }
  }

  async function removeConnection(connection: Connection) {
    if (!window.confirm(`Excluir a conexão ${connection.name}?`)) return;
    const response = await fetch(`/api/whatsapp-connections/${connection.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir a conexão.");
    toast.success("Conexão excluída"); await loadConnections();
  }

  async function addAttendant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!attendantConnection) return; setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/whatsapp-connections/${attendantConnection.id}/attendants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileName: data.get("profileName"), email: data.get("email"), role: data.get("role") }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível vincular o atendente.");
      setAttendantConnection(null); toast.success("Atendente vinculado"); await loadConnections();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível vincular o atendente."); }
    finally { setSaving(false); }
  }

  async function removeAttendant(connection: Connection, attendant: Attendant) {
    const response = await fetch(`/api/whatsapp-connections/${connection.id}/attendants?attendantId=${attendant.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) return toast.error(result.error || "Não foi possível remover o atendente.");
    toast.success("Atendente removido"); await loadConnections();
  }

  async function testConnection(connection: Connection) {
    setTestingId(connection.id);
    try {
      const response = await fetch(`/api/whatsapp-connections/${connection.id}/test`, { method: "POST" });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível testar a conexão.");
      toast.success(result.message || "Conexão validada com sucesso.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível testar a conexão.");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#789087]">Integrações</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-.035em]">WhatsApp multi-tenant</h1>
          <p className="mt-2 text-sm text-[#71827a]">Cada conta configura seu provedor e compartilha o acesso somente com os atendentes escolhidos.</p>
        </div>
        <Button onClick={openCreate} className="bg-[#0b553f] hover:bg-[#074632]"><Plus className="mr-2 size-4" />Nova conexão</Button>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        {loading && <div className="col-span-full grid place-items-center py-20"><LoaderCircle className="size-7 animate-spin text-[#0b553f]" /></div>}
        {!loading && connections.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-[#cbd9d1] bg-white px-6 py-16 text-center">
            <MessageCircle className="mx-auto size-9 text-[#5e7a6f]" />
            <h2 className="mt-4 font-bold">Nenhuma conexão configurada</h2>
            <p className="mt-2 text-sm text-[#71827a]">Cadastre as credenciais do seu provedor para começar.</p>
          </div>
        )}
        {connections.map((connection) => (
          <section key={connection.id} className="rounded-2xl border border-[#dfe8e2] bg-white p-5 shadow-[0_10px_30px_rgba(18,60,47,.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-[#e9f3d8] text-[#47701d]">{connection.provider === "zpro" ? <Webhook className="size-5" /> : <MessageCircle className="size-5" />}</span>
                <div>
                  <h2 className="font-bold">{connection.name}</h2>
                  <p className="mt-1 text-xs text-[#71827a]">
                    {providerLabels[connection.provider]}
                    {connection.provider === "zpro" && connection.apiIdMasked ? ` · ApiID ${connection.apiIdMasked}` : connection.instanceName ? ` · ${connection.instanceName}` : ""}
                  </p>
                </div>
              </div>
              <Badge className={connection.active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>
                {connection.active ? <CheckCircle2 className="mr-1 size-3" /> : <CircleOff className="mr-1 size-3" />}{connection.active ? "Ativa" : "Pausada"}
              </Badge>
            </div>
            {connection.provider === "zpro" && connection.endpointConfigured && <p className="mt-4 rounded-lg bg-[#f4f7f5] px-3 py-2 text-xs text-[#5f746a]">Backend configurado (oculto)</p>}
            {connection.provider !== "zpro" && connection.endpointUrl && <p className="mt-4 truncate rounded-lg bg-[#f4f7f5] px-3 py-2 text-xs text-[#5f746a]">{connection.endpointUrl}</p>}
            <div className="mt-5 border-t border-[#e9eeeb] pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold"><UsersRound className="size-4" />Atendentes</p>
                  <p className="mt-1 text-xs text-[#7b8b84]">{connection.attendants.length} vinculado(s)</p>
                </div>
                {connection.owner && <Button variant="outline" size="sm" onClick={() => setAttendantConnection(connection)}><UserRoundPlus className="mr-2 size-4" />Adicionar</Button>}
              </div>
              <div className="mt-3 space-y-2">
                {connection.attendants.map((attendant) => (
                  <div key={attendant.id} className="flex items-center justify-between rounded-lg bg-[#f7f9f8] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{attendant.profileName}</p>
                      <p className="truncate text-[11px] text-[#75867e]">{attendant.email} · {attendant.role === "manager" ? "Gestor" : "Atendente"}{!attendant.linked ? " · acesso pendente" : ""}</p>
                    </div>
                    {connection.owner && <button onClick={() => removeAttendant(connection, attendant)} aria-label="Remover atendente" className="p-2 text-red-500"><Trash2 className="size-4" /></button>}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {connection.provider === "zpro" && connection.active && (
                <Button variant="outline" size="sm" onClick={() => testConnection(connection)} disabled={testingId === connection.id}>
                  {testingId === connection.id ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Wifi className="mr-2 size-4" />}
                  Testar conexão
                </Button>
              )}
              {connection.owner && <Button variant="ghost" size="sm" onClick={() => openEdit(connection)}><Pencil className="mr-2 size-4" />Editar</Button>}
              {connection.owner && <Button variant="ghost" size="sm" onClick={() => removeConnection(connection)} className="text-red-600 hover:text-red-700"><Trash2 className="mr-2 size-4" />Excluir</Button>}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar conexão" : "Nova conexão WhatsApp"}</DialogTitle>
            <DialogDescription>As credenciais ficam salvas no servidor e não são exibidas novamente.</DialogDescription>
          </DialogHeader>
          <form key={editing?.id || "new"} onSubmit={saveConnection} className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field label="Nome da conexão"><Input name="name" required defaultValue={editing?.name} placeholder="Ex.: WhatsApp Comercial" /></Field>
            <Field label="Provedor">
              <select value={provider} onChange={(event) => setProvider(event.target.value as Provider)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label={provider === "zpro" ? "ApiID da sua ZPRO" : "Instância / sessão"}>
              <Input
                key={provider === "zpro" ? "zpro-api-id" : "provider-instance"}
                name="instanceName"
                required={provider === "zpro" && !editing}
                value={provider === "zpro" ? apiId : undefined}
                onChange={provider === "zpro" ? (event) => setApiId(event.target.value) : undefined}
                defaultValue={provider === "zpro" ? undefined : editing?.instanceName}
                placeholder={provider === "zpro" ? (editing?.apiIdMasked ? `Deixe vazio para manter ${editing.apiIdMasked}` : "UUID após /v2/api/external/") : "Nome ou ID da instância"}
              />
              {provider === "zpro" && <span className="font-normal text-[#71827a]">Você pode deixar este campo vazio ao colar o endpoint completo abaixo.</span>}
            </Field>
            <Field label={provider === "zpro" ? "Token Bearer da ZPRO" : "Token / chave de API"}>
              <Input name="apiToken" type="password" required={provider === "zpro" && !editing} placeholder={editing?.hasToken ? "Deixe vazio para manter a chave" : "Token do provedor"} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={provider === "zpro" ? "URL do backend da sua ZPRO *" : "URL base da API (opcional)"}>
                <Input name="endpointUrl" type="url" required={provider === "zpro" && !editing} value={endpointUrl} onChange={(event) => updateEndpointUrl(event.target.value)} placeholder={provider === "zpro" ? (editing?.endpointConfigured ? "Deixe vazio para manter o backend atual" : "https://backend-da-sua-zpro.com") : "https://api.seu-provedor.com"} />
                {provider === "zpro" && <span className="font-normal text-[#71827a]">Use o backend da sua instalação, não a URL do painel. Também aceitamos o endpoint completo e extraímos o ApiID automaticamente.</span>}
                {provider === "zpro" && endpointPreview && <span className="break-all rounded-md bg-[#edf4ef] px-2 py-1.5 font-mono font-normal text-[#416052]">Endpoint: {endpointPreview}</span>}
              </Field>
            </div>
            {provider === "zpro" && (
              <div className="grid gap-1.5 text-xs font-semibold text-[#4f675d] sm:col-span-2">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="zpro-channel-id">ID do canal</label>
                  <Popover
                    open={channelHelpOpen}
                    onOpenChange={(open) => open ? setChannelHelpOpen(true) : channelHelpBack.close()}
                  >
                    <span
                      className="inline-flex"
                      onMouseEnter={openChannelHelpOnHover}
                      onMouseLeave={closeChannelHelpOnHover}
                    >
                      <PopoverAnchor asChild>
                        <button
                          type="button"
                          aria-label="Como encontrar o ID do canal na ZPRO"
                          aria-expanded={channelHelpOpen}
                          onClick={() => channelHelpOpen ? channelHelpBack.close() : setChannelHelpOpen(true)}
                          className="rounded-full p-0.5 text-[#5e7a6f] outline-none hover:bg-[#e7efe9] focus-visible:ring-2 focus-visible:ring-[#0b553f]"
                        >
                          <Info className="size-4" aria-hidden="true" />
                        </button>
                      </PopoverAnchor>
                    </span>
                    <PopoverContent align="start" className="w-[min(90vw,28rem)] max-w-full space-y-3">
                      <div className="relative aspect-[4/3] w-full max-w-full overflow-hidden rounded-lg bg-[#f3f7f4]">
                        <Image
                          src="/help/zpro-canal-id.jpg"
                          alt="Painel da ZPRO mostrando o ID do canal ao lado do nome da conexão"
                          fill
                          sizes="(max-width: 640px) 90vw, 28rem"
                          className="object-contain"
                        />
                      </div>
                      <p className="text-sm font-normal leading-relaxed text-[#4f675d]">
                        No painel da ZPRO, o ID é o número com # ao lado do nome da conexão (ex.: #21).
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input id="zpro-channel-id" name="channelId" inputMode="numeric" pattern="[1-9][0-9]*" required defaultValue={editing?.channelId ?? ""} placeholder="Ex.: 21" />
                <span className="font-normal text-[#71827a]">Informe somente o número inteiro e positivo, sem o caractere #.</span>
              </div>
            )}
            <label className="flex items-center justify-between rounded-xl bg-[#f3f7f4] p-4 text-sm font-semibold sm:col-span-2">Conexão ativa<Switch checked={active} onCheckedChange={setActive} /></label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-[#0b553f] hover:bg-[#074632]">{saving && <LoaderCircle className="mr-2 size-4 animate-spin" />}Salvar conexão</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!attendantConnection} onOpenChange={(open) => !open && setAttendantConnection(null)}>
        <DialogContent className="rounded-2xl sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Vincular atendente</DialogTitle><DialogDescription>Se o e-mail já tiver conta, o acesso será liberado imediatamente.</DialogDescription></DialogHeader>
          <form onSubmit={addAttendant} className="mt-2 space-y-4">
            <Field label="Nome de Perfil"><Input name="profileName" required placeholder="Nome exibido" /></Field>
            <Field label="E-mail de acesso"><Input name="email" type="email" required placeholder="atendente@empresa.com" /></Field>
            <Field label="Permissão"><select name="role" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="attendant">Atendente</option><option value="manager">Gestor</option></select></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAttendantConnection(null)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-[#0b553f] hover:bg-[#074632]">Vincular</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">{label}{children}</label>;
}
