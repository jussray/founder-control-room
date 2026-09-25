import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const fcrOrigin = (process.env.EXPO_PUBLIC_FCR_ORIGIN?.trim() ?? '').replace(/\/$/, '');

function required(value: string, label: string): string {
  if (!value) throw new Error(`${label} is required for Founder Control Room mobile.`);
  return value;
}

export const mobileSupabase = createClient(
  required(supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL'),
  required(supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

export async function signInFounder(email: string, password: string): Promise<Session> {
  const { data, error } = await mobileSupabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.session) throw error ?? new Error('Founder session was not created.');
  return data.session;
}

export async function signOutFounder(): Promise<void> {
  const { error } = await mobileSupabase.auth.signOut();
  if (error) throw error;
}

export async function currentFounderSession(): Promise<Session | null> {
  const { data, error } = await mobileSupabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function founderGet<T>(path: string): Promise<T> {
  const session = await currentFounderSession();
  if (!session?.access_token) throw new Error('Sign in to Founder Control Room first.');

  const response = await fetch(`${required(fcrOrigin, 'EXPO_PUBLIC_FCR_ORIGIN')}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Founder Control Room read failed (${response.status}).`);
  return payload;
}

export type DashboardTask = {
  id: string;
  title: string;
  status: string;
  risk_level: string | null;
  updated_at: string;
  project: { slug: string; name: string } | null;
};

export type DashboardActivity = {
  id: string;
  event_type: string;
  severity: string;
  created_at: string;
  project: { slug: string; name: string } | null;
};

export type ProofSnapshot = {
  state?: string;
  status?: string;
  readiness?: string;
  [key: string]: unknown;
};

export function loadTasks() {
  return founderGet<{ tasks: DashboardTask[] }>('/dashboard/tasks');
}

export function loadActivity() {
  return founderGet<{ activity: DashboardActivity[] }>('/dashboard/activity');
}

export function loadCosts() {
  return founderGet<{ totalUsd: number; byAgent: Array<{ agentName: string; costUsd: number }> }>('/dashboard/costs');
}

export function loadProofEngine(projectSlug: string) {
  const slug = encodeURIComponent(projectSlug.trim());
  if (!slug) throw new Error('Enter a project slug first.');
  return founderGet<{ project: { slug: string; name: string }; snapshot: ProofSnapshot }>(
    `/dashboard/proof-engine?projectSlug=${slug}`,
  );
}
