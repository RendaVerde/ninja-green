"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Leaf,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Stage = "checking" | "ready" | "saving" | "invalid";

export function PasswordSetupForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let active = true;

    async function prepareSession() {
      try {
        const hash = new URLSearchParams(
          window.location.hash.replace(/^#/, ""),
        );
        const query = new URLSearchParams(window.location.search);
        const authError = hash.get("error_code") || query.get("error");

        if (authError) {
          if (active) {
            setDetails(
              hash.get("error_description") ||
                "Este convite não é mais válido.",
            );
            setStage("invalid");
          }
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
          return;
        }

        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const supabase = createSupabaseBrowserClient();

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          if (active) {
            setDetails(
              "O convite expirou, já foi usado ou não pertence a este navegador.",
            );
            setStage("invalid");
          }
          return;
        }

        if (active) setStage("ready");
      } catch {
        if (active) {
          setDetails("Não foi possível validar este convite.");
          setStage("invalid");
        }
      }
    }

    void prepareSession();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("confirmation") || "");

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }

    setStage("saving");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar a senha.");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a senha.",
      );
      setStage("ready");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f6f4] px-5 py-10 text-[#15372d]">
      <section className="w-full max-w-[470px] rounded-3xl border border-[#dfe8e2] bg-white p-7 shadow-[0_24px_70px_rgba(18,60,47,.10)] sm:p-9">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#b7e64a] text-[#063d2e]">
            <Leaf className="size-6" />
          </span>
          <div>
            <strong className="block text-lg">Ninja Green</strong>
            <span className="text-xs text-[#6e8178]">Ativação de acesso</span>
          </div>
        </div>

        {stage === "checking" && (
          <div className="py-16 text-center">
            <LoaderCircle className="mx-auto size-8 animate-spin text-[#0b553f]" />
            <h1 className="mt-5 text-xl font-bold">Validando seu convite</h1>
            <p className="mt-2 text-sm text-[#71827a]">
              Isso leva apenas alguns segundos.
            </p>
          </div>
        )}

        {stage === "invalid" && (
          <div className="pt-10 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-50 text-amber-600">
              <AlertTriangle className="size-7" />
            </span>
            <h1 className="mt-5 text-2xl font-bold">
              Convite inválido ou expirado
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#71827a]">{details}</p>
            <p className="mt-2 text-sm leading-6 text-[#71827a]">
              Peça ao administrador para enviar um novo convite.
            </p>
            <Button
              asChild
              className="mt-7 h-11 w-full bg-[#0b553f] hover:bg-[#074632]"
            >
              <Link href="/login">Voltar ao login</Link>
            </Button>
          </div>
        )}

        {(stage === "ready" || stage === "saving") && (
          <div className="pt-9">
            <div className="flex items-start gap-3 rounded-2xl bg-[#edf7df] p-4 text-[#315719]">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <p className="text-sm leading-6">
                <strong className="block">Convite confirmado</strong>Crie sua
                senha para concluir o acesso.
              </p>
            </div>
            <h1 className="mt-7 text-2xl font-bold tracking-[-.03em]">
              Defina sua senha
            </h1>
            <p className="mt-2 text-sm text-[#71827a]">
              Use pelo menos 8 caracteres.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-5">
              <PasswordField
                name="password"
                label="Nova senha"
                show={showPassword}
              />
              <PasswordField
                name="confirmation"
                label="Confirme a nova senha"
                show={showPassword}
              />
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#64766e]">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) => setShowPassword(event.target.checked)}
                  className="size-4 accent-[#0b553f]"
                />
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
                Mostrar senhas
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={stage === "saving"}
                className="h-12 w-full rounded-xl bg-[#0b553f] text-base hover:bg-[#074632]"
              >
                {stage === "saving" ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 size-4" />
                    Criar senha e entrar
                  </>
                )}
              </Button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}

function PasswordField({
  name,
  label,
  show,
}: {
  name: string;
  label: string;
  show: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#385449]">
      {label}
      <div className="relative">
        <LockKeyhole className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#81928a]" />
        <Input
          name={name}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          className="h-12 rounded-xl bg-white pl-10"
        />
      </div>
    </label>
  );
}
