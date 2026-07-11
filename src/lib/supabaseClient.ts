import { createClient } from "@supabase/supabase-js";

/**
 * This client points at the Control Room's OWN Supabase project
 * (founder-control-room, ref oojzfmmywbvficgybaxd) — never Bip's database.
 *
 * Uses the service role key because this runs only in the trusted Control
 * Room backend, never in a browser/client context. Row Level Security is
 * enabled with no anon/authenticated policies, so this is the only way in.
 */
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — see .env.example"
  );
}

export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
