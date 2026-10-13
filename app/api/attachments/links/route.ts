import { NextResponse } from "next/server";
import { z } from "zod";

import { signMessageAttachments } from "@/lib/message-attachment-links";
import { messageAttachmentsSchema } from "@/lib/message-attachment-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({ attachments: messageAttachmentsSchema });

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lista de anexos inválida." }, { status: 400 });

  try {
    const attachments = await signMessageAttachments(supabase, user.id, parsed.data.attachments);
    return NextResponse.json({ attachments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível preparar os anexos." }, { status: 400 });
  }
}
