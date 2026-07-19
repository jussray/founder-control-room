import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser/SSR client — free tier, no realtime subscription required
export const supabase = createClient(url, anon, {
  auth: { persistSession: false }
});

// Server/API client — uses service role key, never exposed to browser
export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
