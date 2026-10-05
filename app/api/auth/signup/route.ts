import { NextResponse } from "next/server";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signupSchema = z.object({ profileName: z.string().trim().min(2).max(100), email: z.string().trim().email(), password: z.string().min(8).max(72) });

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "O cadastro ainda não foi configurado." }, { status: 503 });
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise o nome de perfil, o e-mail e a senha." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
  const { data, error } = await supabase.auth.signUp({ email: parsed.data.email.toLowerCase(), password: parsed.data.password, options: { data: { full_name: parsed.data.profileName }, emailRedirectTo: new URL("/auth/callback?next=/", appUrl.endsWith("/") ? appUrl : appUrl + "/").toString() } });
  if (error) return NextResponse.json({ error: error.message.toLowerCase().includes("registered") ? "Este e-mail já possui cadastro." : "Não foi possível criar sua conta." }, { status: 400 });
  return NextResponse.json({ authenticated: Boolean(data.session), confirmationRequired: !data.session });
}
