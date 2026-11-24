import { describe, expect, it } from "vitest";
import { easternDate, eligibleForDelivery, publicWatchRecord, type WatchRecord } from "./watchDeliveryBoundary.js";
const base: WatchRecord = {
  id: "source:2026-11-14:1", lane: "security", title: "Confirmed advisory",
  sourceUrl: "https://example.org/advisory", publishedAt: "2026-11-14T12:00:00Z",
  evidence: "VERIFIED", independentlyCorroborated: true, consequential: true,
  projectIds: ["founder-control-room"], privateNotes: "founder-only", nextStep: "Review",
};
describe("watch delivery boundary", () => {
  it("fails closed for unverified or uncorroborated candidates", () => {
    const now = new Date("2026-11-14T15:00:00Z");
    expect(eligibleForDelivery({...base, evidence: "UNKNOWN"}, {alertedIds: []}, now)).toBe(false);
    expect(eligibleForDelivery({...base, independentlyCorroborated: false}, {alertedIds: []}, now)).toBe(false);
    expect(eligibleForDelivery({...base, consequential: false}, {alertedIds: []}, now)).toBe(false);
  });
  it("deduplicates security alerts", () => {
    expect(eligibleForDelivery(base, {alertedIds: [base.id]}, new Date())).toBe(false);
  });
  it("limits routine world briefing to 8 AM Eastern once per local day", () => {
    const world = {...base, lane: "world" as const};
    const before = new Date("2026-11-14T12:59:00Z");
    const after = new Date("2026-11-14T13:01:00Z");
    expect(eligibleForDelivery(world, {alertedIds: []}, before)).toBe(false);
    expect(eligibleForDelivery(world, {alertedIds: []}, after)).toBe(true);
    expect(eligibleForDelivery(world, {alertedIds: [], lastWorldBriefLocalDate: easternDate(after)}, after)).toBe(false);
  });
  it("allows verified exceptional world breaking alerts before 8 AM", () => {
    expect(eligibleForDelivery({...base, lane: "world", urgent: true}, {alertedIds: []}, new Date("2026-11-14T10:00:00Z"))).toBe(true);
  });
  it("never exports founder-only fields publicly", () => {
    const view = publicWatchRecord(base);
    expect(JSON.stringify(view)).not.toContain("founder-only");
    expect(JSON.stringify(view)).not.toContain("projectIds");
    expect(JSON.stringify(view)).not.toContain("nextStep");
  });
});
