import type { QuickScanProspect } from './contracts.js';

const prospects = new Map<string, QuickScanProspect>();

// Stripe event ids already applied to a prospect. In-memory like the rest of
// this bounded v1 store: it survives one process lifetime, which is enough
// to stop a single retried webhook delivery from double-crediting a
// prospect, but not a restart. Durable idempotency is a store-level upgrade,
// not a webhook-handler concern.
const processedStripeEventIds = new Set<string>();

export function listQuickScanProspects(): QuickScanProspect[] {
  return [...prospects.values()].map((item) => structuredClone(item));
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

export function resetQuickScanStoreForTests(): void {
  prospects.clear();
  processedStripeEventIds.clear();
}
