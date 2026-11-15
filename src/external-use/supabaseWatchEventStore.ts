import type { SupabaseClient } from "@supabase/supabase-js";
import type { WatchEventStore } from "./watchDeliveryPersistence.js";
import type { WatchRecord } from "./watchDeliveryBoundary.js";

const SOURCE = "juss_shared_watch";
const TYPE = "watch_delivery_claim";
/**
 * Uses the existing events UUID primary key as the concurrency arbiter.
 * Claims are NOT sent/delivered receipts. Notification is a separate explicit gate.
 */
export function supabaseWatchEventStore(client: Pick<SupabaseClient, "from">): WatchEventStore {
  return {
    async hasDelivered(id) {
      const { data, error } = await client.from("events").select("id")
        .eq("source", SOURCE).eq("event_type", TYPE).eq("id", id).limit(1);
      if (error) throw new Error(`watch_claim_lookup_failed:${error.code ?? "unknown"}`);
      return Boolean(data?.length);
    },
    async lastWorldBriefDate() {
      const { data, error } = await client.from("events").select("payload")
        .eq("source", SOURCE).eq("event_type", TYPE)
        .filter("payload->>lane", "eq", "world")
        .not("payload->>local_date", "is", null)
        .order("observed_at", { ascending: false }).limit(1);
      if (error) throw new Error(`watch_world_claim_lookup_failed:${error.code ?? "unknown"}`);
      const date = (data?.[0]?.payload as { local_date?: unknown } | undefined)?.local_date;
      return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
    },
    async claimDelivery(id, record: WatchRecord, localDate) {
      // Persist only an allowlisted summary. Never store founder notes in the claim.
      const row = {
        id, source: SOURCE, lane_id: "founder-os", event_type: TYPE,
        observed_at: new Date().toISOString(), processed: true,
        payload: {
          schema: "juss.watch-claim@v1", lane: record.lane,
          source_url: record.sourceUrl, record_id: record.id,
          evidence: record.evidence, local_date: localDate ?? null,
          status: "CLAIMED_NOT_DELIVERED",
        },
      };
      const { data, error } = await client.from("events")
        .upsert(row, { onConflict: "id", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(`watch_claim_write_failed:${error.code ?? "unknown"}`);
      return Boolean(data?.length);
    },
  };
}
