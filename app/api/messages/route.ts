import { after, NextResponse } from "next/server";
import { z } from "zod";

import {
  OutboundMessageError,
  sendOutboundMessage,
  type SendOutboundMessageResult,
} from "@/lib/outbound-messages";
import {
  advanceActiveSequence,
  dispatchOutboundBatch,
} from "@/lib/outbound-dispatcher";
import { messageAttachmentsSchema } from "@/lib/message-attachment-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 45;

const messageSchema = z.object({
  messageId: z.string().uuid(),
  contactId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  manual: z.boolean().default(false),
  attachments: messageAttachmentsSchema,
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  let result: SendOutboundMessageResult;
  try {
    result = await sendOutboundMessage({
      supabase,
      userId: user.id,
      contactId: parsed.data.contactId,
      body: parsed.data.body,
      messageId: parsed.data.messageId,
      source: "single",
      forceManual: parsed.data.manual,
      attachments: parsed.data.attachments,
    });
  } catch (error) {
    if (error instanceof OutboundMessageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Não foi possível registrar a atividade." }, { status: 500 });
  }

  if (result.mode === "queue") {
    after(async () => {
      await dispatchOutboundBatch({ ownerId: user.id });
    });
  } else if (!result.deduplicated) {
    await advanceActiveSequence(supabase, {
      source: "single",
      contactId: parsed.data.contactId,
      ownerId: user.id,
    });
  }
  return NextResponse.json({ ok: true, ...result });
}
