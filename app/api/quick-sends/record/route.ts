import { NextResponse } from "next/server";
import { z } from "zod";

import { OutboundMessageError, recordOutboundMessage } from "@/lib/outbound-messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const recordSchema = z.object({
  contactId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const parsed = recordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });

  try {
    await recordOutboundMessage({
      supabase,
      userId: user.id,
      contactId: parsed.data.contactId,
      body: parsed.data.body,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OutboundMessageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Não foi possível registrar a atividade." }, { status: 500 });
  }
}
