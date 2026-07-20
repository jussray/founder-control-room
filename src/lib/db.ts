import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient.js';

export function getDb(): SupabaseClient {
  return supabase;
}
