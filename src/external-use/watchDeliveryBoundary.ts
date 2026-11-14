/** Shared read-only decision boundary for security alerts and world-news briefs.
 * Candidate discovery is never evidence of an incident or permission to publish.
 */
export type WatchLane = "security" | "world";
export type EvidenceStatus = "VERIFIED" | "INFERRED" | "UNKNOWN";
export interface WatchRecord {
  id: string;
  lane: WatchLane;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  eventAt?: string;
  evidence: EvidenceStatus;
  independentlyCorroborated: boolean;
  consequential: boolean;
  urgent?: boolean;
  projectIds: string[];
  privateNotes?: string;
  nextStep: string;
  rollback?: string;
}
export interface WatchDeliveryState {
  alertedIds: readonly string[];
  lastWorldBriefLocalDate?: string;
}
export function easternDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function easternHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23",
  }).format(now));
}
export function eligibleForDelivery(record: WatchRecord, state: WatchDeliveryState, now: Date): boolean {
  if (!record.id || !record.sourceUrl.startsWith("https://") || !Number.isFinite(Date.parse(record.publishedAt))) return false;
  if (record.evidence !== "VERIFIED" || !record.independentlyCorroborated || !record.consequential) return false;
  if (state.alertedIds.includes(record.id)) return false;
  if (record.lane === "security") return true;
  if (record.urgent) return true; // exceptional, verified breaking world event
  return easternHour(now) >= 8 && state.lastWorldBriefLocalDate !== easternDate(now);
}
/** Explicit public projection: never export private evidence, project IDs, or internal next steps. */
export function publicWatchRecord(record: WatchRecord) {
  return {
    title: record.title,
    sourceUrl: record.sourceUrl,
    publishedAt: record.publishedAt,
    eventAt: record.eventAt ?? null,
    evidence: record.evidence,
  };
}
