import type { User } from "@supabase/supabase-js";

export function isAdminUser(user: User) {
  if (user.app_metadata?.role === "admin") return true;
  const allowedEmails = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return Boolean(user.email && allowedEmails.includes(user.email.toLowerCase()));
}

export function getUserDisplayName(user: User) {
  return String(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário");
}
