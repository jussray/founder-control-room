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
  const lastWorldBriefLocalDate = record.lane === "world" && !record.urgent
    ? await store.lastWorldBriefDate() : undefined;
  const alreadyDelivered = await store.hasDelivered(watchDeliveryId(record.id));
  const state: WatchDeliveryState = {
    alertedIds: alreadyDelivered ? [record.id] : [],
    lastWorldBriefLocalDate,
  };
  if (!eligibleForDelivery(record, state, now)) return { claimed: false, reason: "ineligible_or_duplicate" };
  const claimed = await store.claimDelivery(watchDeliveryId(record.id), record,
    record.lane === "world" && !record.urgent ? localDate : undefined);
  return { claimed, reason: claimed ? "claimed_for_review" : "concurrent_duplicate" };
}
