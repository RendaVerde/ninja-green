"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Leaf, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignupForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileName: data.get("profileName"), email: data.get("email"), password: data.get("password") }) });
      const result = await response.json() as { error?: string; authenticated?: boolean; confirmationRequired?: boolean };
      if (!response.ok) throw new Error(result.error || "Não foi possível criar a conta.");
      if (result.authenticated) { router.replace("/"); router.refresh(); return; }
      setSuccess("Conta criada. Confirme o e-mail recebido antes de entrar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a conta.");
    } finally { setLoading(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f3f6f4] px-5 py-10 text-[#15372d]"><section className="w-full max-w-[470px] rounded-3xl border border-[#dfe8e2] bg-white p-7 shadow-[0_24px_70px_rgba(18,60,47,.10)] sm:p-9"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#b7e64a] text-[#063d2e]"><Leaf className="size-6" /></span><div><strong className="block text-lg">Ninja Green</strong><span className="text-xs text-[#6e8178]">Criação de acesso</span></div></div><div className="mt-8"><p className="text-sm font-semibold text-[#769027]">Comece agora</p><h1 className="mt-2 text-3xl font-bold tracking-[-.035em]">Crie sua conta</h1><p className="mt-2 text-sm text-[#71827a]">Seus dados e conexões ficarão isolados em seu perfil.</p></div><form onSubmit={submit} className="mt-7 space-y-5"><label className="grid gap-2 text-sm font-semibold text-[#385449]">Nome de Perfil<div className="relative"><UserRound className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#81928a]" /><Input name="profileName" required minLength={2} maxLength={100} placeholder="Como você quer ser identificado" className="h-12 pl-10" /></div></label><label className="grid gap-2 text-sm font-semibold text-[#385449]">E-mail<div className="relative"><Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#81928a]" /><Input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com" className="h-12 pl-10" /></div></label><label className="grid gap-2 text-sm font-semibold text-[#385449]">Senha<div className="relative"><LockKeyhole className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#81928a]" /><Input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={72} placeholder="Mínimo de 8 caracteres" className="h-12 px-10" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#71847b]">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}{success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}<Button type="submit" disabled={!configured || loading || Boolean(success)} className="h-12 w-full bg-[#0b553f] hover:bg-[#074632]">{loading && <LoaderCircle className="mr-2 size-4 animate-spin" />}{loading ? "Criando…" : "Criar conta"}</Button></form><p className="mt-7 text-center text-sm text-[#71827a]">Já possui acesso? <Link href="/login" className="font-bold text-[#0b553f] hover:underline">Entrar</Link></p></section></main>;
}
