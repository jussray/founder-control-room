import { describe, expect, it } from "vitest";
import { supabaseWatchEventStore } from "./supabaseWatchEventStore.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WatchRecord } from "./watchDeliveryBoundary.js";

const record: WatchRecord = {
  id: "advisory-1", lane: "security", title: "Advisory",
  sourceUrl: "https://example.org/advisory", publishedAt: "2026-11-14T12:00:00Z",
  evidence: "VERIFIED", independentlyCorroborated: true, consequential: true,
  projectIds: ["founder-control-room"], privateNotes: "SECRET_NOT_FOR_STORAGE", nextStep: "Review",
};
describe("Supabase watch event store", () => {
  it("inserts an allowlisted claim and suppresses duplicate insertions", async () => {
    const ids = new Set<string>();
    let captured: Record<string, unknown> | undefined;
    const client = { from: (table: string) => {
      expect(table).toBe("events");
      return { upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => {
        captured = row;
        expect(options).toMatchObject({onConflict: "id", ignoreDuplicates: true});
        return {select: async () => {
          if(ids.has(row.id as string)) return {data: [], error: null};
          ids.add(row.id as string);
          return {data: [{id: row.id}], error: null};
        }};
      }};
    }} as unknown as Pick<SupabaseClient, "from">;
    const store = supabaseWatchEventStore(client);
    expect(await store.claimDelivery("claim-1", record)).toBe(true);
    expect(await store.claimDelivery("claim-1", record)).toBe(false);
    expect(JSON.stringify(captured)).not.toContain("SECRET_NOT_FOR_STORAGE");
    expect(JSON.stringify(captured)).not.toContain("projectIds");
    expect(captured?.processed).toBe(true);
    expect((captured?.payload as {status:string}).status).toBe("CLAIMED_NOT_DELIVERED");
  });
  it("fails closed on Supabase errors", async () => {
    const client = {from: () => ({upsert: () => ({select: async () => ({
      data: null, error: {code: "42501"}
    })})})} as unknown as Pick<SupabaseClient, "from">;
    await expect(supabaseWatchEventStore(client).claimDelivery("claim-2", record))
      .rejects.toThrow("watch_claim_write_failed:42501");
  });
});
