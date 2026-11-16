import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/env";
import type { Database } from "@/types/database.generated";

/**
 * Privileged service-role Supabase client for webhook and cron route handlers.
 * Never import into Client Components or browser-reachable code.
 */
export function createAdminSupabaseClient() {
  const { url } = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY environment variable.");
  }

  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
