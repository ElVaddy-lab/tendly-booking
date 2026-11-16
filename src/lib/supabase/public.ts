import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";
import { getSupabasePublicEnv } from "../env";

/**
 * Stateless anonymous Supabase client that never touches request cookies or
 * dynamic I/O, making it safe inside Next.js `use cache` functions and public RPC calls.
 */
export function createPublicSupabaseClient() {
  const { url, publishableKey } = getSupabasePublicEnv();

  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
