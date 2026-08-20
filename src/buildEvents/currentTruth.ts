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
/**
 * A current-main fact is valid only when a server-owned live GitHub
 * revalidation observed it recently. Webhook delivery order is not a branch
 * ordering guarantee, so stored webhook source facts remain historical
 * provenance.
 */
export const CURRENT_MAIN_REVALIDATION_LEASE_MS = 15 * 60 * 1_000;

const EXACT_SHA = /^[0-9a-f]{40}$/i;

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
  lastObservedMainSha: CurrentTruthFact<string> | null;
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
  ineligibleCoverageFacts: number;
  unboundCoverageFacts: number;
  latestEventAt: string | null;
}

export interface CurrentTruthProjectionInput {
  projectSlug: string;
  repository: string;
  events: readonly BuildEvent[];
  /**
   * Ephemeral read-through identity from the enrolled repository provider.
   * This must never be reconstructed from a stored BuildEvent or webhook.
   */
  currentMainRevalidation?: CurrentMainRevalidation;
  nowMs?: number;
}

export interface CurrentMainRevalidation {
  repository: string;
  branch: string;
  commitSha: string;
  provider: 'github';
  observedAt: string;
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

function sameRepository(event: BuildEvent, expectedRepository: string): boolean {
  return sameRepositoryName(event.repository?.name, expectedRepository);
}

function sameRepositoryName(actualRepository: string | undefined, expectedRepository: string): boolean {
  return actualRepository?.trim().toLowerCase() === expectedRepository.trim().toLowerCase();
}

function observedMainSha(event: BuildEvent, expectedRepository: string): string | null {
  return event.source === 'github'
    && event.category === 'source'
    && event.truth === 'verified'
    && event.authority === 'observed'
    && event.status === 'completed'
    && sameRepository(event, expectedRepository)
    && event.repository?.refKind === 'branch-head'
    && event.repository.branch === 'main'
    && event.repository.commitSha
    ? event.repository.commitSha
    : null;
}

function liveCurrentMainSha(
  revalidation: CurrentMainRevalidation | undefined,
  expectedRepository: string,
  nowMs: number,
): CurrentTruthFact<string> | null {
  if (!revalidation) return null;
  const observedAtMs = Date.parse(revalidation.observedAt);
  const commitSha = revalidation.commitSha.toLowerCase();
  const valid = revalidation.provider === 'github'
    && sameRepositoryName(revalidation.repository, expectedRepository)
    && revalidation.branch === 'main'
    && EXACT_SHA.test(commitSha)
    && Number.isFinite(observedAtMs)
    && observedAtMs <= nowMs
    && nowMs - observedAtMs < CURRENT_MAIN_REVALIDATION_LEASE_MS;
  if (!valid) return null;

  return {
    value: commitSha,
    truth: 'verified',
    status: 'completed',
    occurredAt: new Date(observedAtMs).toISOString(),
    eventId: `system:live-github-main:${commitSha}:${observedAtMs}`,
    evidenceUrls: [],
    evidenceRefs: [`live-provider-revalidation:github:${expectedRepository.trim()}:main`],
  };
}

function eligibleCoverage(
  event: BuildEvent,
  expectedRepository: string,
): BuildReleaseCoverageRef | null {
  return event.coverage
    && event.truth === 'verified'
    && event.status === 'passed'
    && sameRepository(event, expectedRepository)
    ? event.coverage
    : null;
}

function controlPlaneEvent(event: BuildEvent): boolean {
  return event.source === 'founder' || event.source === 'system';
}

function trustedOperationalEvent(
  event: BuildEvent,
  expectedRepository: string,
  category: 'provider' | 'runtime' | 'verification',
): boolean {
  if (
    event.category !== category
    || event.truth !== 'verified'
    || event.authority !== 'observed'
    || !sameRepository(event, expectedRepository)
  ) return false;

  // A prior external receipt may remain in storage after its credential's
  // capabilities are narrowed. Do not let that historical payload retain a
  // durable operational success claim in Current Truth.
  if (category === 'runtime') return event.source === 'system';
  return event.source === 'github' || event.source === 'system';
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
  expectedRepository: string,
  expiredCoverageFacts: number,
  ineligibleCoverageFacts: number,
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
          Boolean(
            eligibleCoverage(event, expectedRepository)
              && event.coverage!.releaseSha !== currentMainSha,
          )
        )).length
      : 0,
    expiredCoverageFacts,
    ineligibleCoverageFacts,
    unboundCoverageFacts,
    latestEventAt: events[0]?.occurredAt ?? null,
  };
}

export function buildCurrentTruthProjection(
  input: CurrentTruthProjectionInput,
): CurrentTruthProjection {
  const nowMs = input.nowMs ?? Date.now();
  const events = newestFirst(input.events);

  const lastObservedMainSha = newestVerifiedMapped(
    events,
    (event) => observedMainSha(event, input.repository),
  );

  // A webhook can arrive late or out of order. It is preserved above as
  // historical provenance, but cannot make a mutable branch look current.
  // Only the read-through provider revalidation supplied by the route can.
  const currentMainSha = liveCurrentMainSha(
    input.currentMainRevalidation,
    input.repository,
    nowMs,
  );

  const auditedSha = newestVerifiedMapped(events, (event) => (
    event.source === 'system'
      && event.category === 'artifact'
      && event.truth === 'verified'
      && event.authority === 'observed'
      && event.status === 'completed'
      && sameRepository(event, input.repository)
      ? event.repository?.auditedCommitSha ?? null
      : null
  ));

  const goal = newestMapped(events, (event) => (
    controlPlaneEvent(event) ? event.goal ?? null : null
  ));
  const phase = newestMapped(events, (event) => (
    controlPlaneEvent(event) ? event.phase : null
  ));
  const nextGate = newestMapped(events, (event) => (
    controlPlaneEvent(event) ? event.nextGate ?? null : null
  ));
  const founderDecision = newestMapped(events, (event) => (
    event.source === 'founder' && event.category === 'decision' && event.decision
      ? event.decision
      : null
  ));

  const providers = latestByKey(
    events,
    (event) => trustedOperationalEvent(event, input.repository, 'provider') && event.provider
      ? `${event.provider.name}:${event.provider.resource ?? 'default'}`
      : null,
    (event) => trustedOperationalEvent(event, input.repository, 'provider')
      ? event.provider ?? null
      : null,
  );

  const runtimes = latestByKey(
    events,
    (event) => trustedOperationalEvent(event, input.repository, 'runtime') && event.runtime
      ? `${event.runtime.service}:${event.runtime.environment}`
      : null,
    (event) => trustedOperationalEvent(event, input.repository, 'runtime')
      ? event.runtime ?? null
      : null,
  );

  const eligibleCoverageFacts = events
    .map((event) => ({ event, coverage: eligibleCoverage(event, input.repository) }))
    .filter((entry): entry is { event: BuildEvent; coverage: BuildReleaseCoverageRef } => (
      entry.coverage !== null
    ));
  const activeCoverageFacts = eligibleCoverageFacts.filter((entry) => (
    coverageWithinTruthLease(entry.coverage, nowMs)
  ));
  const ineligibleCoverageFacts = events.filter((event) => (
    Boolean(event.coverage && !eligibleCoverage(event, input.repository))
  )).length;
  const expiredCoverageFacts = eligibleCoverageFacts.length - activeCoverageFacts.length;

  // Select only active coverage for the freshly revalidated main SHA. If a
  // newer stale release shares the same service/environment, it must not mask
  // an older still-valid observation of the actual current release.
  const coverage = currentMainSha
    ? latestByKey(
        events,
        (event) => {
          const candidate = eligibleCoverage(event, input.repository);
          return candidate
            && coverageWithinTruthLease(candidate, nowMs)
            && candidate.releaseSha === currentMainSha.value
            ? `${candidate.service}:${candidate.environment}`
            : null;
        },
        (event) => {
          const candidate = eligibleCoverage(event, input.repository);
          return candidate
            && coverageWithinTruthLease(candidate, nowMs)
            && candidate.releaseSha === currentMainSha.value
            ? candidate
            : null;
        },
      )
    : {};

  const unboundCoverageFacts = currentMainSha ? 0 : activeCoverageFacts.length;

  const verifications = latestByKey(
    events,
    (event) => trustedOperationalEvent(event, input.repository, 'verification')
      ? event.verification?.kind ?? null
      : null,
    (event) => trustedOperationalEvent(event, input.repository, 'verification')
      ? event.verification ?? null
      : null,
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
    projectSlug: input.projectSlug,
    goal,
    phase,
    nextGate,
    source: {
      currentMainSha,
      lastObservedMainSha,
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
      input.repository,
      expiredCoverageFacts,
      ineligibleCoverageFacts,
      unboundCoverageFacts,
    ),
  };
}
