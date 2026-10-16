import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const settingsSchema = z
  .object({
    automaticSendingEnabled: z.boolean().optional(),
    pauseAll: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.automaticSendingEnabled !== undefined || value.pauseAll !== undefined,
    "Nenhuma configuração foi informada.",
  );

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("outbound_settings")
    .select("automatic_sending_enabled,pause_all,timezone,per_connection_batch_limit,last_used_connection_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível carregar as configurações de envio." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    automaticSendingEnabled: data?.automatic_sending_enabled ?? false,
    pauseAll: data?.pause_all ?? false,
    timezone: data?.timezone ?? "America/Sao_Paulo",
    perConnectionBatchLimit: data?.per_connection_batch_limit ?? 3,
    lastUsedConnectionId: data?.last_used_connection_id ?? null,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const parsed = settingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Configuração inválida." },
      { status: 400 },
    );
  }
  const { error } = await supabase.from("outbound_settings").upsert(
    {
      user_id: user.id,
      ...(parsed.data.automaticSendingEnabled !== undefined
        ? {
            automatic_sending_enabled:
              parsed.data.automaticSendingEnabled,
          }
        : {}),
      ...(parsed.data.pauseAll !== undefined
        ? { pause_all: parsed.data.pauseAll }
        : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar as configurações de envio." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
