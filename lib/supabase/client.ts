"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createSupabaseBrowserClient() {
  if (!browserClient) {
    const { url, anonKey } = getSupabasePublicConfig();
    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}
