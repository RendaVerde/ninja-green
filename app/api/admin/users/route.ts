import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const userSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["user", "admin"]),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "A administração ainda não foi configurada." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!isAdminUser(user)) return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise os dados e use uma senha com pelo menos 8 caracteres." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
    app_metadata: { role: parsed.data.role },
  });

  if (error || !data.user) {
    const duplicate = error?.message.toLowerCase().includes("already") || error?.message.toLowerCase().includes("registered");
    return NextResponse.json({ error: duplicate ? "Já existe um usuário com este e-mail." : "Não foi possível criar o usuário." }, { status: 400 });
  }

  await admin.from("profiles").upsert({ id: data.user.id, full_name: parsed.data.fullName, role: parsed.data.role });

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email, fullName: parsed.data.fullName, role: parsed.data.role, createdAt: data.user.created_at },
  });
}
