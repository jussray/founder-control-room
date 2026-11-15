import { makeSupabaseClient, type SupabaseEnv } from "../lib/supabaseClient.js";
import { claimEligibleWatchDelivery } from "./watchDeliveryPersistence.js";
import { supabaseWatchEventStore } from "./supabaseWatchEventStore.js";
import type { WatchRecord } from "./watchDeliveryBoundary.js";

/**
 * Trusted backend intake for independently verified shared-watch records.
 * Does not discover, verify, email, publish, or mark an alert as delivered.
 * Never call with an unreviewed search result or expose through an anonymous route.
 */
export async function recordVerifiedSharedWatch(
  env: SupabaseEnv,
  record: WatchRecord,
  now = new Date(),
) {
  // Explicit evidence gate before acquiring privileged database credentials.
  if (record.evidence !== "VERIFIED" || !record.independentlyCorroborated) {
    return { claimed: false, reason: "unverified_evidence" };
  }
  const client = makeSupabaseClient(env);
  return claimEligibleWatchDelivery(supabaseWatchEventStore(client), record, now);
}
