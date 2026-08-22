import type { QuickScanProspect } from './contracts.js';

const prospects = new Map<string, QuickScanProspect>();

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

export function resetQuickScanStoreForTests(): void {
  prospects.clear();
}
