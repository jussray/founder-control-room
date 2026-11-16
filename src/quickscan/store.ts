import type { SupabaseClient } from '@supabase/supabase-js';
import type { GrowthOpportunityAssessment } from '../growth/opportunityIntelligence.js';
import { assessQuickScanProspectOpportunity } from '../growth/quickScanOpportunityBridge.js';
import type { QuickScanProspect } from './contracts.js';

export type QuickScanProspectView = QuickScanProspect & {
  opportunity: GrowthOpportunityAssessment;
};

const prospects = new Map<string, QuickScanProspect>();
const processedStripeEventIds = new Set<string>();

function memoryStoreEnabled(): boolean {
  return process.env.NODE_ENV === 'test';
}

function prospectView(prospect: QuickScanProspect): QuickScanProspectView {
  const clone = structuredClone(prospect);
  return {
    ...clone,
    opportunity: assessQuickScanProspectOpportunity(clone),
  };
}

async function durableClient(): Promise<SupabaseClient> {
  const { supabase } = await import('../lib/supabaseClient.js');
  return supabase;
}

function rowProspect(value: unknown): QuickScanProspect {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('QUICKSCAN_STORE_INVALID_PROSPECT_ROW');
  }
  return structuredClone(value as QuickScanProspect);
}

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

export async function listQuickScanProspectsDurable(): Promise<QuickScanProspectView[]> {
  if (memoryStoreEnabled()) return listQuickScanProspects();

  const supabase = await durableClient();
  const { data, error } = await supabase
    .from('quickscan_prospects')
    .select('prospect')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`QUICKSCAN_STORE_LIST_FAILED: ${error.message}`);

  return (data ?? []).map((row) => prospectView(rowProspect(row.prospect)));
}

export async function getQuickScanProspectDurable(id: string): Promise<QuickScanProspect | null> {
  if (memoryStoreEnabled()) return getQuickScanProspect(id);

  const supabase = await durableClient();
  const { data, error } = await supabase
    .from('quickscan_prospects')
    .select('prospect')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`QUICKSCAN_STORE_GET_FAILED: ${error.message}`);
  return data ? rowProspect(data.prospect) : null;
}

export async function saveQuickScanProspectDurable(prospect: QuickScanProspect): Promise<QuickScanProspect> {
  if (memoryStoreEnabled()) return saveQuickScanProspect(prospect);

  const supabase = await durableClient();
  const clone = structuredClone(prospect);
  const { error } = await supabase
    .from('quickscan_prospects')
    .upsert(
      {
        id: clone.id,
        prospect: clone,
        updated_at: clone.updatedAt,
      },
      { onConflict: 'id' },
    );

  if (error) throw new Error(`QUICKSCAN_STORE_SAVE_FAILED: ${error.message}`);
  return clone;
}

export async function isStripeEventProcessedDurable(eventId: string): Promise<boolean> {
  if (memoryStoreEnabled()) return isStripeEventProcessed(eventId);

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
  if (memoryStoreEnabled()) {
    markStripeEventProcessed(eventId);
    return;
  }

  const supabase = await durableClient();
  const { error } = await supabase
    .from('quickscan_stripe_events')
    .upsert(
      {
        event_id: eventId,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'event_id', ignoreDuplicates: true },
    );

  if (error) throw new Error(`QUICKSCAN_STRIPE_EVENT_WRITE_FAILED: ${error.message}`);
}

export function resetQuickScanStoreForTests(): void {
  prospects.clear();
  processedStripeEventIds.clear();
}
