import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rows } = vi.hoisted(() => ({
  rows: {
    quickscan_prospects: new Map<string, { id: string; prospect: unknown; updated_at: string }>(),
    quickscan_stripe_events: new Map<string, { event_id: string; processed_at: string }>(),
  },
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    from(table: 'quickscan_prospects' | 'quickscan_stripe_events') {
      let selectedId: string | undefined;
      const builder = {
        select() { return builder; },
        eq(_column: string, value: string) { selectedId = value; return builder; },
        order: async () => ({
          data: [...rows[table].values()],
          error: null,
        }),
        maybeSingle: async () => {
          const row = rows[table].get(selectedId ?? '');
          return { data: row ?? null, error: null };
        },
        upsert: async (value: Record<string, unknown>) => {
          if (table === 'quickscan_prospects') {
            rows.quickscan_prospects.set(String(value.id), value as never);
          } else {
            rows.quickscan_stripe_events.set(String(value.event_id), value as never);
          }
          return { error: null };
        },
      };
      return builder;
    },
  },
}));

import {
  getQuickScanProspectDurable,
  isStripeEventProcessedDurable,
  listQuickScanProspectsDurable,
  markStripeEventProcessedDurable,
  resetQuickScanStoreForTests,
  saveQuickScanProspectDurable,
} from '../store.js';
import { createProspect } from '../engine.js';

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  rows.quickscan_prospects.clear();
  rows.quickscan_stripe_events.clear();
  resetQuickScanStoreForTests();
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe('QuickScan durable store adapter', () => {
  it('persists prospect state across in-memory store resets and reads it back', async () => {
    const prospect = createProspect({
      businessName: 'Durable Test Studio',
      segment: 'salon_studio_team_owner',
    });
    await saveQuickScanProspectDurable(prospect);

    resetQuickScanStoreForTests();

    await expect(getQuickScanProspectDurable(prospect.id)).resolves.toMatchObject({
      id: prospect.id,
      businessName: 'Durable Test Studio',
    });
    await expect(listQuickScanProspectsDurable()).resolves.toHaveLength(1);
  });

  it('persists Stripe event idempotency independently of process memory', async () => {
    expect(await isStripeEventProcessedDurable('evt_durable_1')).toBe(false);
    await markStripeEventProcessedDurable('evt_durable_1');

    resetQuickScanStoreForTests();

    await expect(isStripeEventProcessedDurable('evt_durable_1')).resolves.toBe(true);
  });
});
