import { NextResponse } from "next/server";

import { dispatchOutboundBatch } from "@/lib/outbound-dispatcher";
import { materializeDueSequenceMessages } from "@/lib/outbound-scheduler";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

async function hasValidBearer(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const { data, error } = await createSupabaseAdminClient().rpc(
    "verify_outbound_cron_bearer",
    { target_bearer: supplied },
  );
  return !error && data === true;
}

export async function POST(request: Request) {
  if (!(await hasValidBearer(request))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const materialization = await materializeDueSequenceMessages();
    const summary = await dispatchOutboundBatch();
    return NextResponse.json({ ok: true, materialization, dispatch: summary });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível processar a fila de saída." },
      { status: 500 },
    );
  }
}
