import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * This client points at the Control Room's OWN Supabase project
 * (founder-control-room, ref oojzfmmywbvficgybaxd) — never Bip's database.
 *
 * Uses the service role key because this runs only in the trusted Control
 * Room backend, never in a browser/client context.
 *
 * Usage (Node / existing code — no change needed):
 *   import { supabase } from "../lib/supabaseClient.js";
 *
 * Usage (Workers — pass env bindings):
 *   import { makeSupabaseClient } from "../lib/supabaseClient.js";
 *   const supabase = makeSupabaseClient(env);
 */

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Factory — works in both Node (reads process.env) and Workers (reads
 * the `env` binding passed in). Pass `env` explicitly in Workers context;
 * omit it (or call the default `supabase` export) in Node context.
 */
export function makeSupabaseClient(env?: SupabaseEnv): SupabaseClient {
  const url = env?.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    env?.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — see .env.example"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Default singleton for Node / existing callers.
 * Throws at import time if env vars are missing — same behaviour as before.
 */
export const supabase = makeSupabaseClient();
