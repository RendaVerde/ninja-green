import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const userSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  role: z.enum(["user", "admin"]),
});

function getInviteRedirectUrl(request: Request) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const origin = configuredSiteUrl || new URL(request.url).origin;
  return new URL(
    "/auth/invite",
    origin.endsWith("/") ? origin : origin + "/",
  ).toString();
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "A administração ainda não foi configurada." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!isAdminUser(user))
    return NextResponse.json(
      { error: "Acesso restrito ao administrador." },
      { status: 403 },
    );

  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revise o nome, o e-mail e o tipo de acesso." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const email = parsed.data.email.toLowerCase();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: parsed.data.fullName },
    redirectTo: getInviteRedirectUrl(request),
  });

  if (error || !data.user) {
    const duplicate =
      error?.message.toLowerCase().includes("already") ||
      error?.message.toLowerCase().includes("registered");
    return NextResponse.json(
      {
        error: duplicate
          ? "Já existe um usuário com este e-mail. Convites expirados devem ser reenviados pelo Supabase."
          : "Não foi possível enviar o convite.",
      },
      { status: 400 },
    );
  }

  const { error: roleError } = await admin.auth.admin.updateUserById(
    data.user.id,
    {
      app_metadata: { role: parsed.data.role },
    },
  );
  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    full_name: parsed.data.fullName,
    role: parsed.data.role,
  });

  if (roleError || profileError) {
    return NextResponse.json(
      {
        error:
          "O convite foi enviado, mas o perfil precisa ser revisado no Supabase.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
      createdAt: data.user.created_at,
    },
  });
}
