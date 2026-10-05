import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const attendantSchema = z.object({ profileName: z.string().trim().min(2).max(100), email: z.string().trim().email(), role: z.enum(["attendant", "manager"]).default("attendant") });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = attendantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise o atendente." }, { status: 400 });
  const { id } = await context.params;
  const { data: connection } = await supabase.from("whatsapp_connections").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!connection) return NextResponse.json({ error: "Conexão não encontrada." }, { status: 404 });
  let userId: string | null = null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = data?.users.find((item) => item.email?.toLowerCase() === parsed.data.email.toLowerCase())?.id || null;
  }
  const { error } = await supabase.from("whatsapp_connection_attendants").insert({ connection_id: id, profile_name: parsed.data.profileName, email: parsed.data.email.toLowerCase(), role: parsed.data.role, user_id: userId });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Este atendente já está vinculado." : "Não foi possível vincular o atendente." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const attendantId = new URL(request.url).searchParams.get("attendantId");
  if (!attendantId) return NextResponse.json({ error: "Atendente não informado." }, { status: 400 });
  const { id } = await context.params;
  const { data: connection } = await supabase.from("whatsapp_connections").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!connection) return NextResponse.json({ error: "Conexão não encontrada." }, { status: 404 });
  const { error } = await supabase.from("whatsapp_connection_attendants").delete().eq("id", attendantId).eq("connection_id", id);
  if (error) return NextResponse.json({ error: "Não foi possível remover o atendente." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
