import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const settingsSchema = z
  .object({
    automaticSendingEnabled: z.boolean().optional(),
    pauseAll: z.boolean().optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    defaultSendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    safeWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    safeWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    staleToleranceHours: z.number().int().min(1).max(168).optional(),
    hostConcurrencyLimit: z.number().int().min(1).max(50).optional(),
  })
  .refine(
    (value) =>
      Object.values(value).some((item) => item !== undefined),
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
    .select("automatic_sending_enabled,pause_all,timezone,default_send_time,safe_window_start,safe_window_end,stale_tolerance_hours,host_concurrency_limit,per_connection_batch_limit,last_used_connection_id")
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
    defaultSendTime: data?.default_send_time?.slice(0, 5) ?? "09:00",
    safeWindowStart: data?.safe_window_start?.slice(0, 5) ?? "08:00",
    safeWindowEnd: data?.safe_window_end?.slice(0, 5) ?? "20:00",
    staleToleranceHours: data?.stale_tolerance_hours ?? 12,
    hostConcurrencyLimit: data?.host_concurrency_limit ?? 3,
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
      ...(parsed.data.timezone !== undefined
        ? { timezone: parsed.data.timezone }
        : {}),
      ...(parsed.data.defaultSendTime !== undefined
        ? { default_send_time: parsed.data.defaultSendTime }
        : {}),
      ...(parsed.data.safeWindowStart !== undefined
        ? { safe_window_start: parsed.data.safeWindowStart }
        : {}),
      ...(parsed.data.safeWindowEnd !== undefined
        ? { safe_window_end: parsed.data.safeWindowEnd }
        : {}),
      ...(parsed.data.staleToleranceHours !== undefined
        ? { stale_tolerance_hours: parsed.data.staleToleranceHours }
        : {}),
      ...(parsed.data.hostConcurrencyLimit !== undefined
        ? { host_concurrency_limit: parsed.data.hostConcurrencyLimit }
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
