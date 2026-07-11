import { createClient } from "@supabase/supabase-js";

/**
 * Auth-only Supabase client, created with the PUBLISHABLE (anon) key —
 * never the service role key. This is the client that's allowed to call
 * `auth.signInWithOtp` / `auth.verifyOtp` / `auth.getUser`, because those
 * are the operations a public, unauthenticated caller is meant to be able
 * to reach (rate-limited by Supabase itself).
 *
 * All privileged DB reads/writes still go through `lib/supabaseClient.ts`
 * (service role), never through this client.
 */
const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY — see .env.example"
  );
}

export const supabaseAuth = createClient(url, publishableKey, {
  auth: { persistSession: false },
});
