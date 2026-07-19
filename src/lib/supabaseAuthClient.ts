import { createClient } from '@supabase/supabase-js';

/**
 * Auth-only Supabase clients use a public publishable key, never the service
 * role. SUPABASE_ANON_KEY remains a deployment-compatibility fallback while
 * Worker secrets are migrated to the modern publishable-key name.
 */
const url = process.env.SUPABASE_URL;
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing SUPABASE_URL and a publishable auth key — see .env.example',
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
