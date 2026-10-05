import { NextResponse } from "next/server";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const passwordSchema = z.object({
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "A autenticação ainda não foi configurada." },
      { status: 503 },
    );
  }

  const parsed = passwordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Use uma senha com pelo menos 8 caracteres." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      {
        error:
          "O convite expirou ou já foi utilizado. Solicite um novo convite.",
      },
      { status: 401 },
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível definir a senha. Tente novamente." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
