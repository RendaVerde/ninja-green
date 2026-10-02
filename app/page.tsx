import { redirect } from "next/navigation";
import { NinjaGreenApp } from "@/components/ninja-green-app";
import { getUserDisplayName, isAdminUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) {
    return <NinjaGreenApp currentUser={{ name: "Rafael", email: "Modo local" }} authEnabled={false} isAdmin />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <NinjaGreenApp currentUser={{ name: getUserDisplayName(user), email: user.email || "" }} authEnabled isAdmin={isAdminUser(user)} />;
}
