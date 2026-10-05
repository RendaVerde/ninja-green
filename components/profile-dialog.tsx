"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type UserProfile = { name: string; email: string };

export function ProfileDialog({ open, onOpenChange, profile, onUpdated }: { open: boolean; onOpenChange: (open: boolean) => void; profile: UserProfile; onUpdated: (profile: UserProfile) => void }) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => { setName(profile.name); setEmail(profile.email); setPassword(""); }, 0);
    return () => window.clearTimeout(timer);
  }, [open, profile]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true);
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileName: name, email, password }) });
      const result = await response.json() as { error?: string; profile?: UserProfile; emailPending?: boolean };
      if (!response.ok || !result.profile) throw new Error(result.error || "Não foi possível atualizar o perfil.");
      onUpdated(result.profile); setPassword(""); onOpenChange(false);
      toast.success("Perfil atualizado", { description: result.emailPending ? "Confirme o novo e-mail para concluir a alteração." : "Suas informações foram salvas." });
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível atualizar o perfil."); }
    finally { setLoading(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-2xl sm:max-w-[520px]"><DialogHeader><div className="mb-2 grid size-11 place-items-center rounded-xl bg-[#e6f2d3] text-[#44701b]"><UserRound className="size-5" /></div><DialogTitle>Configurações do perfil</DialogTitle><DialogDescription>Atualize seu nome, e-mail ou senha de acesso.</DialogDescription></DialogHeader><form onSubmit={submit} className="mt-2 space-y-4"><label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">Nome de Perfil<div className="relative"><UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82928b]" /><Input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} className="pl-9" /></div></label><label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">E-mail<div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82928b]" /><Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="pl-9" /></div></label><label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">Nova senha <span className="font-normal text-[#899791]">(opcional)</span><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82928b]" /><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} maxLength={72} placeholder="Deixe em branco para não alterar" className="pl-9" /></div></label><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={loading} className="bg-[#0b553f] hover:bg-[#074632]">{loading && <LoaderCircle className="mr-2 size-4 animate-spin" />}Salvar perfil</Button></div></form></DialogContent></Dialog>;
}
