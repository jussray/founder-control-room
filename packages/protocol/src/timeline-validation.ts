export type CorrelatedRecord = Readonly<{
  id: string;
  correlationId: string;
  causationId: string | null;
}>;

export type TimelineValidationIssueCode =
  | "EMPTY_TIMELINE"
  | "DUPLICATE_EVENT_ID"
  | "MIXED_CORRELATION"
  | "MISSING_CAUSATION_PARENT"
  | "CROSS_CORRELATION_PARENT"
  | "NO_ROOT"
  | "MULTIPLE_ROOTS"
  | "CAUSATION_CYCLE";

export type TimelineValidationIssue = Readonly<{
  code: TimelineValidationIssueCode;
  eventId?: string;
  message: string;
}>;

export type TimelineValidationResult =
  | Readonly<{ ok: true; correlationId: string; rootEventId: string }>
  | Readonly<{ ok: false; issues: readonly TimelineValidationIssue[] }>;

export function validateTimeline(
  records: readonly CorrelatedRecord[],
): TimelineValidationResult {
  if (records.length === 0) {
    return { ok: false, issues: [{ code: "EMPTY_TIMELINE", message: "A timeline must contain at least one record." }] };
  }

  const issues: TimelineValidationIssue[] = [];
  const byId = new Map<string, CorrelatedRecord>();
  const expectedCorrelationId = records[0]!.correlationId;

  for (const record of records) {
    if (byId.has(record.id)) {
      issues.push({ code: "DUPLICATE_EVENT_ID", eventId: record.id, message: `Duplicate event identity detected: ${record.id}.` });
      continue;
    }
    byId.set(record.id, record);
    if (record.correlationId !== expectedCorrelationId) {
      issues.push({ code: "MIXED_CORRELATION", eventId: record.id, message: `Event ${record.id} does not belong to correlation ${expectedCorrelationId}.` });
    }
  }

  for (const record of byId.values()) {
    if (record.causationId === null) continue;
    const parent = byId.get(record.causationId);
    if (!parent) {
      issues.push({ code: "MISSING_CAUSATION_PARENT", eventId: record.id, message: `Event ${record.id} references an unknown parent.` });
    } else if (parent.correlationId !== record.correlationId) {
      issues.push({ code: "CROSS_CORRELATION_PARENT", eventId: record.id, message: `Event ${record.id} references a parent in a different correlation.` });
    }
  }

  const roots = [...byId.values()].filter((record) => record.causationId === null);
  if (roots.length === 0) issues.push({ code: "NO_ROOT", message: "A timeline requires exactly one root event." });
  if (roots.length > 1) issues.push({ code: "MULTIPLE_ROOTS", message: `A timeline requires exactly one root event; found ${roots.length}.` });

  for (const record of byId.values()) {
    const visited = new Set<string>();
    let current: CorrelatedRecord | undefined = record;
    while (current && current.causationId !== null) {
      if (visited.has(current.id)) {
        issues.push({ code: "CAUSATION_CYCLE", eventId: record.id, message: `Causation cycle detected while tracing ${record.id}.` });
        break;
      }
      visited.add(current.id);
      current = byId.get(current.causationId);
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, correlationId: expectedCorrelationId, rootEventId: roots[0]!.id };
}
