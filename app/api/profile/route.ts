import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  profileName: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72).or(z.literal("")).default(""),
});

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise o nome, o e-mail e a senha." }, { status: 400 });

  const requestedEmail = parsed.data.email.toLowerCase();
  const authUpdate: { email?: string; password?: string; data: { full_name: string } } = { data: { full_name: parsed.data.profileName } };
  if (requestedEmail !== user.email?.toLowerCase()) authUpdate.email = requestedEmail;
  if (parsed.data.password) authUpdate.password = parsed.data.password;
  const { data, error } = await supabase.auth.updateUser(authUpdate);
  if (error) {
    const message = error.message.toLowerCase();
    const friendlyMessage = message.includes("same password") || message.includes("different from the old")
      ? "A nova senha precisa ser diferente da senha atual."
      : message.includes("already") ? "Este e-mail já está em uso." : "Não foi possível atualizar o perfil.";
    return NextResponse.json({ error: friendlyMessage }, { status: 400 });
  }
  const { error: profileError } = await supabase.from("profiles").update({ full_name: parsed.data.profileName, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (profileError) return NextResponse.json({ error: "O acesso foi atualizado, mas o nome de perfil não pôde ser salvo." }, { status: 500 });
  const emailPending = requestedEmail !== data.user.email?.toLowerCase();
  return NextResponse.json({ profile: { name: parsed.data.profileName, email: data.user.email || user.email || requestedEmail }, emailPending });
}
