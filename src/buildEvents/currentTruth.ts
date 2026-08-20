import type {
  BuildEvent,
  BuildEventDecisionRef,
  BuildEventPhase,
  BuildEventProviderRef,
  BuildEventRuntimeRef,
  BuildReleaseCoverageRef,
  BuildEventTruth,
  BuildEventVerificationRef,
} from './buildEvent.js';

export const CURRENT_TRUTH_CONTRACT = 'fcr/current-truth@v1' as const;
/** Coverage is a bounded observation, not a durable green status. */
export const CURRENT_COVERAGE_TRUTH_LEASE_MS = 60 * 60 * 1_000;

export interface CurrentTruthFact<T> {
  value: T;
  truth: BuildEventTruth;
  status: BuildEvent['status'];
  occurredAt: string;
  eventId: string;
  evidenceUrls: string[];
  evidenceRefs: string[];
}

export interface CurrentTruthSource {
  currentMainSha: CurrentTruthFact<string> | null;
  auditedSha: CurrentTruthFact<string> | null;
}

export interface CurrentTruthQuality {
  eventCount: number;
  verifiedEvents: number;
  inferredEvents: number;
  unknownEvents: number;
  currentFactCount: number;
  verifiedCurrentFacts: number;
  inferredCurrentFacts: number;
  unknownCurrentFacts: number;
  staleCurrentFacts: number;
  staleCoverageFacts: number;
  expiredCoverageFacts: number;
  unboundCoverageFacts: number;
  latestEventAt: string | null;
}

export interface CurrentTruthProjection {
  contract: typeof CURRENT_TRUTH_CONTRACT;
  projectSlug: string;
  goal: CurrentTruthFact<string> | null;
  phase: CurrentTruthFact<BuildEventPhase> | null;
  nextGate: CurrentTruthFact<string> | null;
  source: CurrentTruthSource;
  founderDecision: CurrentTruthFact<BuildEventDecisionRef> | null;
  providers: Record<string, CurrentTruthFact<BuildEventProviderRef>>;
  runtimes: Record<string, CurrentTruthFact<BuildEventRuntimeRef>>;
  coverage: Record<string, CurrentTruthFact<BuildReleaseCoverageRef>>;
  verifications: Record<string, CurrentTruthFact<BuildEventVerificationRef>>;
  quality: CurrentTruthQuality;
}

function newestFirst(events: readonly BuildEvent[]): BuildEvent[] {
  return [...events].sort((left, right) => {
    const byTime = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    return byTime !== 0 ? byTime : right.eventId.localeCompare(left.eventId);
  });
}

function fact<T>(event: BuildEvent, value: T): CurrentTruthFact<T> {
  return {
    value,
    truth: event.truth,
    status: event.status,
    occurredAt: event.occurredAt,
    eventId: event.eventId,
    evidenceUrls: [...event.evidenceUrls],
    evidenceRefs: [...event.evidenceRefs],
  };
}

function newestMapped<T>(
  events: readonly BuildEvent[],
  mapper: (event: BuildEvent) => T | null,
): CurrentTruthFact<T> | null {
  for (const event of events) {
    const mapped = mapper(event);
    if (mapped !== null) return fact(event, mapped);
  }
  return null;
}

function newestVerifiedMapped<T>(
  events: readonly BuildEvent[],
  mapper: (event: BuildEvent) => T | null,
): CurrentTruthFact<T> | null {
  return newestMapped(events.filter((event) => event.truth === 'verified'), mapper);
}

function latestByKey<T>(
  events: readonly BuildEvent[],
  keyFor: (event: BuildEvent) => string | null,
  valueFor: (event: BuildEvent) => T | null,
): Record<string, CurrentTruthFact<T>> {
  const result: Record<string, CurrentTruthFact<T>> = {};
  for (const event of events) {
    const key = keyFor(event);
    const value = valueFor(event);
    if (!key || value === null || result[key]) continue;
    result[key] = fact(event, value);
  }
  return result;
}

function currentFactEvents(
  events: readonly BuildEvent[],
  providers: Record<string, CurrentTruthFact<BuildEventProviderRef>>,
  runtimes: Record<string, CurrentTruthFact<BuildEventRuntimeRef>>,
  coverage: Record<string, CurrentTruthFact<BuildReleaseCoverageRef>>,
  verifications: Record<string, CurrentTruthFact<BuildEventVerificationRef>>,
  founderDecision: CurrentTruthFact<BuildEventDecisionRef> | null,
): BuildEvent[] {
  const selectedIds = new Set<string>();
  for (const item of Object.values(providers)) selectedIds.add(item.eventId);
  for (const item of Object.values(runtimes)) selectedIds.add(item.eventId);
  for (const item of Object.values(coverage)) selectedIds.add(item.eventId);
  for (const item of Object.values(verifications)) selectedIds.add(item.eventId);
  if (founderDecision) selectedIds.add(founderDecision.eventId);
  return events.filter((event) => selectedIds.has(event.eventId));
}

function boundSha(event: BuildEvent): string | null {
  return event.verification?.exactCommitSha
    ?? event.runtime?.releaseSha
    ?? event.coverage?.releaseSha
    ?? event.repository?.commitSha
    ?? null;
}

function coverageWithinTruthLease(
  coverage: BuildReleaseCoverageRef,
  nowMs: number,
): boolean {
  const windowEndedAtMs = Date.parse(coverage.windowEndedAt);
  return Number.isFinite(windowEndedAtMs)
    && windowEndedAtMs <= nowMs
    // A lease is valid on [windowEndedAt, windowEndedAt + lease), so an
    // aggregate stops being "current" at its exact expiry boundary.
    && nowMs - windowEndedAtMs < CURRENT_COVERAGE_TRUTH_LEASE_MS;
}

function quality(
  events: readonly BuildEvent[],
  currentFacts: readonly BuildEvent[],
  currentMainSha: string | null,
  expiredCoverageFacts: number,
  unboundCoverageFacts: number,
): CurrentTruthQuality {
  const countTruth = (items: readonly BuildEvent[], truth: BuildEventTruth) =>
    items.filter((event) => event.truth === truth).length;

  return {
    eventCount: events.length,
    verifiedEvents: countTruth(events, 'verified'),
    inferredEvents: countTruth(events, 'inferred'),
    unknownEvents: countTruth(events, 'unknown'),
    currentFactCount: currentFacts.length,
    verifiedCurrentFacts: countTruth(currentFacts, 'verified'),
    inferredCurrentFacts: countTruth(currentFacts, 'inferred'),
    unknownCurrentFacts: countTruth(currentFacts, 'unknown'),
    staleCurrentFacts: currentMainSha
      ? currentFacts.filter((event) => {
          const sha = boundSha(event);
          return Boolean(sha && sha !== currentMainSha);
        }).length
      : 0,
    staleCoverageFacts: currentMainSha
      ? events.filter((event) => (
          Boolean(event.coverage && event.coverage.releaseSha !== currentMainSha)
        )).length
      : 0,
    expiredCoverageFacts,
    unboundCoverageFacts,
    latestEventAt: events[0]?.occurredAt ?? null,
  };
}

export function buildCurrentTruthProjection(
  projectSlug: string,
  inputEvents: readonly BuildEvent[],
  nowMs = Date.now(),
): CurrentTruthProjection {
  const events = newestFirst(inputEvents);

  const currentMainSha = newestVerifiedMapped(events, (event) => (
    event.category === 'source'
      && event.repository?.refKind === 'branch-head'
      && event.repository.branch === 'main'
      && event.repository.commitSha
      ? event.repository.commitSha
      : null
  ));

  const auditedSha = newestVerifiedMapped(events, (event) => (
    event.repository?.auditedCommitSha ?? null
  ));

  const goal = newestMapped(events, (event) => event.goal ?? null);
  const phase = newestMapped(events, (event) => event.phase);
  const nextGate = newestMapped(events, (event) => event.nextGate ?? null);
  const founderDecision = newestMapped(events, (event) => (
    event.source === 'founder' && event.category === 'decision' && event.decision
      ? event.decision
      : null
  ));

  const providers = latestByKey(
    events,
    (event) => event.category === 'provider' && event.provider
      ? `${event.provider.name}:${event.provider.resource ?? 'default'}`
      : null,
    (event) => event.category === 'provider' ? event.provider ?? null : null,
  );

  const runtimes = latestByKey(
    events,
    (event) => event.runtime
      ? `${event.runtime.service}:${event.runtime.environment}`
      : null,
    (event) => event.runtime ?? null,
  );

  const coverage = latestByKey(
    events,
    (event) => event.coverage
      ? `${event.coverage.service}:${event.coverage.environment}`
      : null,
    (event) => event.coverage ?? null,
  );

  const expiredCoverageFacts = Object.values(coverage).filter((coverageFact) => (
    !coverageWithinTruthLease(coverageFact.value, nowMs)
  )).length;
  for (const [key, coverageFact] of Object.entries(coverage)) {
    if (!coverageWithinTruthLease(coverageFact.value, nowMs)) delete coverage[key];
  }

  const unboundCoverageFacts = currentMainSha ? 0 : Object.keys(coverage).length;
  if (!currentMainSha) {
    for (const key of Object.keys(coverage)) delete coverage[key];
  } else {
    for (const [key, coverageFact] of Object.entries(coverage)) {
      if (coverageFact.value.releaseSha !== currentMainSha.value) delete coverage[key];
    }
  }

  const verifications = latestByKey(
    events,
    (event) => event.verification?.kind ?? null,
    (event) => event.verification ?? null,
  );

  const selectedCurrentFacts = currentFactEvents(
    events,
    providers,
    runtimes,
    coverage,
    verifications,
    founderDecision,
  );

  return {
    contract: CURRENT_TRUTH_CONTRACT,
    projectSlug,
    goal,
    phase,
    nextGate,
    source: {
      currentMainSha,
      auditedSha,
    },
    founderDecision,
    providers,
    runtimes,
    coverage,
    verifications,
    quality: quality(
      events,
      selectedCurrentFacts,
      currentMainSha?.value ?? null,
      expiredCoverageFacts,
      unboundCoverageFacts,
    ),
  };
}
