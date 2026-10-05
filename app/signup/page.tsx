import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/");
  }
  return <SignupForm configured={configured} />;
}
