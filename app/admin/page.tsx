import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { UserAdmin, type AdminUser } from "@/components/admin/user-admin";
import { isAdminUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return <main className="grid min-h-screen place-items-center bg-[#f3f6f4] px-6 text-center text-[#15372d]"><div className="max-w-lg rounded-2xl border border-[#dfe8e2] bg-white p-8"><ShieldCheck className="mx-auto size-10 text-[#0b553f]" /><h1 className="mt-4 text-2xl font-bold">Área administrativa preparada</h1><p className="mt-3 text-sm leading-6 text-[#6d7f77]">Adicione as variáveis do Supabase e o e-mail do administrador para ativar o cadastro real de usuários.</p><a href="/" className="mt-6 inline-flex rounded-xl bg-[#0b553f] px-5 py-3 text-sm font-semibold text-white">Voltar ao painel</a></div></main>;
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) redirect("/");

  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  const users: AdminUser[] = (data?.users || []).map((item) => ({ id: item.id, email: item.email || "Sem e-mail", fullName: String(item.user_metadata?.full_name || item.email?.split("@")[0] || "Usuário"), role: item.app_metadata?.role === "admin" ? "admin" : "user", createdAt: item.created_at }));
  return <UserAdmin initialUsers={users} />;
}
