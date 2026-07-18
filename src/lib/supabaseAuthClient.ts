import { createClient } from '@supabase/supabase-js';

/**
 * Auth-only Supabase clients use the publishable key, never the service role.
 * A factory is exposed for request-scoped session establishment and refresh so
 * concurrent browser logins cannot share mutable in-memory auth state.
 */
const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY — see .env.example',
  );
}

export function createSupabaseAuthClient() {
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Stateless token validation and magic-link delivery may reuse this client.
 * Request paths that call setSession or refreshSession must use the factory.
 */
export const supabaseAuth = createSupabaseAuthClient();
