"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Leaf, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = window.location.hash;
    const isAuthReturn = hash.includes("access_token=") || hash.includes("error_code=");
    if (isAuthReturn) {
      window.location.replace("/auth/invite" + hash);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return <main className="grid min-h-screen bg-[#f3f6f4] lg:grid-cols-[minmax(380px,46%)_1fr]">
    <section className="relative hidden overflow-hidden bg-[#063d2e] p-12 text-white lg:flex lg:flex-col">
      <div className="absolute -right-40 -top-40 size-[520px] rounded-full border border-white/10" />
      <div className="absolute -right-24 -top-24 size-[360px] rounded-full border border-white/10" />
      <div className="relative flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#b7e64a] text-[#063d2e]"><Leaf className="size-6" /></span><div><strong className="block text-xl">Ninja Green</strong><span className="text-sm text-emerald-100/60">Follow-up inteligente</span></div></div>
      <div className="relative my-auto max-w-lg"><p className="text-sm font-semibold uppercase tracking-[.16em] text-[#b7e64a]">Relacionamentos em movimento</p><h1 className="mt-5 text-5xl font-bold leading-[1.08] tracking-[-.045em]">Cada oportunidade no momento certo.</h1><p className="mt-6 max-w-md text-lg leading-8 text-emerald-50/65">Acesse seus contatos, organize as cadências e acompanhe cada conversa em um único lugar.</p></div>
      <p className="relative text-xs text-emerald-50/45">Acesso individual e protegido para cada usuário.</p>
    </section>

    <section className="flex items-center justify-center px-5 py-10 sm:px-10">
      <div className="w-full max-w-[430px]">
        <div className="mb-10 flex items-center gap-3 lg:hidden"><span className="grid size-11 place-items-center rounded-2xl bg-[#b7e64a] text-[#063d2e]"><Leaf className="size-6" /></span><div><strong className="block text-lg">Ninja Green</strong><span className="text-xs text-[#6e8178]">Follow-up inteligente</span></div></div>
        <div className="mb-8"><p className="text-sm font-semibold text-[#769027]">Bem-vindo de volta</p><h2 className="mt-2 text-3xl font-bold tracking-[-.035em] text-[#123c2f]">Entre na sua conta</h2><p className="mt-2 text-sm leading-6 text-[#6d7f77]">Use o acesso criado pelo administrador da sua equipe.</p></div>

        {!configured && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800"><strong className="block">Autenticação em preparação</strong>Preencha as variáveis do Supabase para liberar o login real. A interface do MVP continua disponível localmente.</div>}

        <form onSubmit={submit} className="space-y-5">
          <label className="grid gap-2 text-sm font-semibold text-[#385449]">E-mail<div className="relative"><Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#81928a]" /><Input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com" className="h-12 rounded-xl bg-white pl-10" /></div></label>
          <label className="grid gap-2 text-sm font-semibold text-[#385449]">Senha<div className="relative"><LockKeyhole className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#81928a]" /><Input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={6} placeholder="Sua senha" className="h-12 rounded-xl bg-white px-10" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#71847b]">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={!configured || loading} className="h-12 w-full rounded-xl bg-[#0b553f] text-base hover:bg-[#074632]">{loading ? <><LoaderCircle className="mr-2 size-4 animate-spin" />Entrando…</> : "Entrar"}</Button>
        </form>
        <p className="mt-8 text-center text-xs leading-5 text-[#82918b]">Não existe cadastro público. Novos acessos são criados pelo administrador na versão web.</p>
      </div>
    </section>
  </main>;
}
