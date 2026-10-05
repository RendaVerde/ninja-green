"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, Leaf, LoaderCircle, Send, ShieldCheck, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "user";
  createdAt: string;
};

export function UserAdmin({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.get("fullName"),
          email: data.get("email"),
          role: data.get("role"),
        }),
      });
      const result = await response.json() as { error?: string; user?: AdminUser };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o convite.");
      if (!result.user) throw new Error("O convite foi enviado, mas a resposta ficou incompleta.");
      setUsers((items) => [result.user!, ...items]);
      form.reset();
      setMessage({ type: "success", text: "Convite enviado. O usuário definirá a própria senha." });
    } catch (cause) {
      setMessage({ type: "error", text: cause instanceof Error ? cause.message : "Não foi possível enviar o convite." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f6f4] text-[#15372d]">
      <header className="border-b border-[#dfe8e2] bg-[#063d2e] px-8 py-5 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#b7e64a] text-[#063d2e]"><Leaf className="size-5" /></span>
            <div><strong className="block">Ninja Green</strong><span className="text-xs text-emerald-100/60">Administração web</span></div>
          </div>
          <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
            <Link href="/"><ArrowLeft className="mr-2 size-4" />Voltar ao painel</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto hidden max-w-7xl px-8 py-10 lg:block">
        <div>
          <p className="text-sm font-semibold text-[#789087]">Acesso e equipe</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-.035em]">Usuários do Ninja Green</h1>
          <p className="mt-2 text-sm text-[#71827a]">Envie convites individuais sem compartilhar senhas temporárias.</p>
        </div>

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[400px_1fr]">
          <section className="rounded-2xl border border-[#dfe8e2] bg-white p-6 shadow-[0_10px_35px_rgba(18,60,47,.05)]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#e8f3d5] text-[#49751f]"><UserRoundPlus className="size-5" /></span>
              <div><h2 className="font-bold">Convidar usuário</h2><p className="text-xs text-[#788980]">Disponível somente na administração web.</p></div>
            </div>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Nome de Perfil"><Input name="fullName" required placeholder="Nome exibido no aplicativo" /></Field>
              <Field label="E-mail"><Input name="email" type="email" required placeholder="usuario@empresa.com" /></Field>
              <Field label="Tipo de acesso">
                <select name="role" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </Field>
              {message && (
                <div className={"rounded-lg p-3 text-sm " + (message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                  {message.text}
                </div>
              )}
              <Button type="submit" disabled={loading} className="w-full bg-[#0b553f] hover:bg-[#074632]">
                {loading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                Enviar convite
              </Button>
            </form>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#dfe8e2] bg-white">
            <div className="flex items-center justify-between border-b border-[#e6ece8] p-6">
              <div><h2 className="flex items-center gap-2 font-bold"><UsersRound className="size-5 text-[#5d7b6f]" />Equipe cadastrada</h2><p className="mt-1 text-xs text-[#7a8b83]">{users.length} {users.length === 1 ? "usuário" : "usuários"}</p></div>
              <Badge className="rounded-full bg-[#e7f3d2] text-[#436b21] hover:bg-[#e7f3d2]">Acesso protegido</Badge>
            </div>
            <div className="divide-y divide-[#edf1ef]">
              {users.map((user) => (
                <div key={user.id} className="grid grid-cols-[1fr_150px_130px] items-center gap-4 px-6 py-4">
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{user.fullName}</p><p className="mt-1 truncate text-xs text-[#77877f]">{user.email}</p></div>
                  <div>
                    {user.role === "admin"
                      ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700"><ShieldCheck className="size-4" />Administrador</span>
                      : <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-4" />Usuário</span>}
                  </div>
                  <span className="text-right text-xs text-[#819089]">{new Date(user.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-81px)] place-items-center px-6 text-center lg:hidden">
        <div className="max-w-sm">
          <ShieldCheck className="mx-auto size-10 text-[#0b553f]" />
          <h1 className="mt-4 text-xl font-bold">Administração somente na web</h1>
          <p className="mt-2 text-sm leading-6 text-[#6d7f77]">Abra esta página em um computador para cadastrar e gerenciar usuários. O aplicativo do celular continua limpo e focado no follow-up.</p>
          <Button asChild className="mt-5 bg-[#0b553f]"><Link href="/">Voltar ao aplicativo</Link></Button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold text-[#4f675d]">{label}{children}</label>;
}
