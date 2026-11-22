import { createHash } from "node:crypto";
import { easternDate, eligibleForDelivery, type WatchDeliveryState, type WatchRecord } from "./watchDeliveryBoundary.js";

/** Stable UUID for a single delivery receipt. Never put raw private notes in the key. */
export function watchDeliveryId(recordId: string): string {
  const h = createHash("sha256").update("juss.watch-delivery@v1|" + recordId).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export interface WatchEventStore {
  hasDelivered(id: string): Promise<boolean>;
  lastWorldBriefDate(): Promise<string | undefined>;
  /** Atomic insert-if-absent. False means another worker already claimed this delivery. */
  claimDelivery(id: string, record: WatchRecord, localDate?: string): Promise<boolean>;
}
/**
 * Admission and durable claim only. This module intentionally sends nothing.
 * The caller must have verified the source independently before setting VERIFIED.
 */
export async function claimEligibleWatchDelivery(
  store: WatchEventStore, record: WatchRecord, now: Date,
): Promise<{ claimed: boolean; reason: string }> {
  const localDate = easternDate(now);
  const recordClaimId = watchDeliveryId(record.id);

  // Record identity is independent of the daily briefing window and urgency.
  // This prevents the same story being admitted again on a later day or through
  // the urgent path after it was already claimed for a routine briefing.
  if (await store.hasDelivered(recordClaimId)) {
    return { claimed: false, reason: "ineligible_or_duplicate" };
  }

  const isRoutineWorldBrief = record.lane === "world" && !record.urgent;
  const lastWorldBriefLocalDate = isRoutineWorldBrief
    ? await store.lastWorldBriefDate() : undefined;
  const state: WatchDeliveryState = { alertedIds: [], lastWorldBriefLocalDate };
  if (!eligibleForDelivery(record, state, now)) {
    return { claimed: false, reason: "ineligible_or_duplicate" };
  }

  if (isRoutineWorldBrief) {
    // The date-scoped claim remains the atomic one-briefing-per-day gate.
    const dailyClaimId = watchDeliveryId(`world-brief:${localDate}`);
    const dailyClaimed = await store.claimDelivery(dailyClaimId, record, localDate);
    if (!dailyClaimed) return { claimed: false, reason: "concurrent_duplicate" };

    // A second, stable identity claim preserves story-level deduplication
    // across dates and across routine/urgent world-news admission paths.
    // If concurrent cross-date attempts race, the record claim still fails
    // closed; at worst a daily slot is conservatively consumed.
    const recordClaimed = await store.claimDelivery(recordClaimId, record);
    return {
      claimed: recordClaimed,
      reason: recordClaimed ? "claimed_for_review" : "ineligible_or_duplicate",
    };
  }

  const claimed = await store.claimDelivery(recordClaimId, record);
  return { claimed, reason: claimed ? "claimed_for_review" : "concurrent_duplicate" };
}
