import { describe, expect, it } from "vitest";
import { claimEligibleWatchDelivery, watchDeliveryId, type WatchEventStore } from "./watchDeliveryPersistence.js";
import type { WatchRecord } from "./watchDeliveryBoundary.js";
const record: WatchRecord = { id:"advisory-1", lane:"security", title:"Advisory", sourceUrl:"https://example.org/a",
  publishedAt:"2026-11-14T12:00:00Z", evidence:"VERIFIED", independentlyCorroborated:true,
  consequential:true, projectIds:["founder-control-room"], nextStep:"Review" };
describe("durable watch admission", () => {
  it("claims only once and never sends a notification", async () => {
    const ids = new Set<string>();
    const store: WatchEventStore = { hasDelivered: async id => ids.has(id), lastWorldBriefDate: async () => undefined,
      claimDelivery: async id => { if(ids.has(id)) return false; ids.add(id); return true; } };
    const now = new Date("2026-11-14T14:00:00Z");
    expect((await claimEligibleWatchDelivery(store, record, now)).claimed).toBe(true);
    expect((await claimEligibleWatchDelivery(store, record, now)).claimed).toBe(false);
    expect(watchDeliveryId(record.id)).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("rejects an already delivered world briefing for the Eastern date", async () => {
    const store: WatchEventStore = { hasDelivered: async () => false,
      lastWorldBriefDate: async () => "2026-11-14", claimDelivery: async () => {throw Error("must not claim");} };
    expect((await claimEligibleWatchDelivery(store, {...record,lane:"world"},new Date("2026-11-14T15:00:00Z"))).claimed).toBe(false);
  });
  it("rejects unverified items before claiming", async () => {
    const store: WatchEventStore = { hasDelivered: async () => false, lastWorldBriefDate: async () => undefined,
      claimDelivery: async () => {throw Error("must not claim");} };
    expect((await claimEligibleWatchDelivery(store, {...record,evidence:"INFERRED"},new Date())).claimed).toBe(false);
  });
});
