import type { SupabaseClient } from '@supabase/supabase-js';
import type { GrowthOpportunityAssessment } from '../growth/opportunityIntelligence.js';
import { assessQuickScanProspectOpportunity } from '../growth/quickScanOpportunityBridge.js';
import type { QuickScanProspect } from './contracts.js';

export type QuickScanProspectView = QuickScanProspect & {
  opportunity: GrowthOpportunityAssessment;
};

const prospects = new Map<string, QuickScanProspect>();
const processedStripeEventIds = new Set<string>();

function useMemoryStore(): boolean {
  return process.env.NODE_ENV === 'test';
}

function prospectView(value: QuickScanProspect): QuickScanProspectView {
  const prospect = structuredClone(value);
  return { ...prospect, opportunity: assessQuickScanProspectOpportunity(prospect) };
}

async function durableClient(): Promise<SupabaseClient> {
  const { supabase } = await import('../lib/supabaseClient.js');
  return supabase;
}

function parseProspect(value: unknown): QuickScanProspect {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('QUICKSCAN_STORE_INVALID_PROSPECT_ROW');
  }
  const prospect = structuredClone(value as QuickScanProspect);
  if (typeof prospect.id !== 'string' || !prospect.id.trim()) {
    throw new Error('QUICKSCAN_STORE_INVALID_PROSPECT_ID');
  }
  return prospect;
}

// Synchronous helpers remain the deterministic in-memory test adapter.
export function listQuickScanProspects(): QuickScanProspectView[] {
  return [...prospects.values()].map(prospectView);
}

export function getQuickScanProspect(id: string): QuickScanProspect | null {
  const found = prospects.get(id);
  return found ? structuredClone(found) : null;
}

export function saveQuickScanProspect(prospect: QuickScanProspect): QuickScanProspect {
  prospects.set(prospect.id, structuredClone(prospect));
  return structuredClone(prospect);
}

export function isStripeEventProcessed(eventId: string): boolean {
  return processedStripeEventIds.has(eventId);
}

export function markStripeEventProcessed(eventId: string): void {
  processedStripeEventIds.add(eventId);
}

// Production adapters use the FCR-owned service-role Supabase client.
// NODE_ENV=test deliberately uses the in-memory adapter so tests never
// require or mutate a live database.
export async function listQuickScanProspectsDurable(): Promise<QuickScanProspectView[]> {
  if (useMemoryStore()) return listQuickScanProspects();
  const supabase = await durableClient();
  const { data, error } = await supabase
    .from('quickscan_prospects')
    .select('prospect')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`QUICKSCAN_STORE_LIST_FAILED: ${error.message}`);
  return (data ?? []).map((row: { prospect: unknown }) => prospectView(parseProspect(row.prospect)));
}

export async function getQuickScanProspectDurable(id: string): Promise<QuickScanProspect | null> {
  if (useMemoryStore()) return getQuickScanProspect(id);
  const supabase = await durableClient();
  const { data, error } = await supabase
    .from('quickscan_prospects')
    .select('prospect')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`QUICKSCAN_STORE_GET_FAILED: ${error.message}`);
  return data ? parseProspect(data.prospect) : null;
}

export async function saveQuickScanProspectDurable(prospect: QuickScanProspect): Promise<QuickScanProspect> {
  if (useMemoryStore()) return saveQuickScanProspect(prospect);
  const clone = parseProspect(prospect);
  const supabase = await durableClient();
  const { error } = await supabase
    .from('quickscan_prospects')
    .upsert({
      id: clone.id,
      prospect: clone,
      updated_at: clone.updatedAt,
    }, { onConflict: 'id' });
  if (error) throw new Error(`QUICKSCAN_STORE_SAVE_FAILED: ${error.message}`);
  return clone;
}

export async function isStripeEventProcessedDurable(eventId: string): Promise<boolean> {
  if (useMemoryStore()) return isStripeEventProcessed(eventId);
  const supabase = await durableClient();
  const { data, error } = await supabase
    .from('quickscan_stripe_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(`QUICKSCAN_STRIPE_EVENT_READ_FAILED: ${error.message}`);
  return Boolean(data);
}

export async function markStripeEventProcessedDurable(eventId: string): Promise<void> {
  if (useMemoryStore()) {
    markStripeEventProcessed(eventId);
    return;
  }
  const supabase = await durableClient();
  const { error } = await supabase
    .from('quickscan_stripe_events')
    .upsert({ event_id: eventId, processed_at: new Date().toISOString() }, {
      onConflict: 'event_id',
      ignoreDuplicates: true,
    });
  if (error) throw new Error(`QUICKSCAN_STRIPE_EVENT_WRITE_FAILED: ${error.message}`);
}

export function resetQuickScanStoreForTests(): void {
  prospects.clear();
  processedStripeEventIds.clear();
}
