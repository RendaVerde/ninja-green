import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { dispatchOutboundBatch } from "@/lib/outbound-dispatcher";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

function hasValidBearer(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "O segredo do despachante não foi configurado." },
      { status: 503 },
    );
  }
  if (!hasValidBearer(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const summary = await dispatchOutboundBatch();
    return NextResponse.json({ ok: true, ...summary });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível processar a fila de saída." },
      { status: 500 },
    );
  }
}
