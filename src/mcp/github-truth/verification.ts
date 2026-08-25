import type {
  CiAuditObservation,
  EvaluatePrAuditEvidenceInput,
  PrAuditCiConclusion,
  PrAuditEvidenceEvaluation,
  PrAuditFinding,
  PrAuditFindingSeverity,
  PrAuditFreshness,
} from './types.js';

export const DEFAULT_PR_AUDIT_FRESHNESS_MS = 5 * 60 * 1000;

const MAX_PR_AUDIT_FRESHNESS_MS = 60 * 60 * 1000;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SEVERITY_ORDER: Record<PrAuditFindingSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

type SignalSource = 'check' | 'workflow';
type SignalOutcome = PrAuditCiConclusion;

interface SourcedObservation {
  source: SignalSource;
  observation: CiAuditObservation;
}

function normalizedSha(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return FULL_SHA.test(normalized) ? normalized : null;
}

function signalOutcome(observation: CiAuditObservation): SignalOutcome {
  if (
    observation.status === 'queued'
    || observation.status === 'requested'
    || observation.status === 'waiting'
    || observation.status === 'in_progress'
    || observation.status === 'pending'
  ) {
    return 'pending';
  }
  if (observation.status !== 'completed') return 'unknown';
  if (observation.conclusion === 'success') return 'pass';
  if (
    observation.conclusion === 'failure'
    || observation.conclusion === 'cancelled'
    || observation.conclusion === 'timed_out'
    || observation.conclusion === 'action_required'
    || observation.conclusion === 'stale'
    || observation.conclusion === 'startup_failure'
  ) {
    return 'fail';
  }
  return 'unknown';
}

function observationFreshness(
  observedAt: string,
  nowMs: number,
  freshnessWindowMs: number,
): PrAuditFreshness {
  const observedAtMs = Date.parse(observedAt);
  if (Number.isNaN(observedAtMs) || observedAtMs > nowMs) return 'unknown';
  return nowMs - observedAtMs <= freshnessWindowMs ? 'current' : 'stale';
}

function findingsSorter(left: PrAuditFinding, right: PrAuditFinding): number {
  return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message);
}

function addFinding(
  findings: Map<string, PrAuditFinding>,
  severity: PrAuditFindingSeverity,
  code: string,
  message: string,
): void {
  if (!findings.has(code)) findings.set(code, { severity, code, message });
}

function hasConflictingSignals(
  signals: readonly SourcedObservation[],
  currentHeadSha: string | null,
): boolean {
  if (!currentHeadSha) return false;
  const outcomesByIdentity = new Map<string, Set<SignalOutcome>>();
  for (const { source, observation } of signals) {
    const headSha = normalizedSha(observation.headSha);
    if (headSha !== currentHeadSha) continue;
    const identity = `${source}:${observation.name.trim().toLowerCase()}:${headSha}`;
    const outcomes = outcomesByIdentity.get(identity) ?? new Set<SignalOutcome>();
    outcomes.add(signalOutcome(observation));
    outcomesByIdentity.set(identity, outcomes);
  }
  return [...outcomesByIdentity.values()].some((outcomes) => outcomes.size > 1);
}

export function evaluatePrAuditEvidence(
  input: EvaluatePrAuditEvidenceInput,
): PrAuditEvidenceEvaluation {
  const findings = new Map<string, PrAuditFinding>();
  const nowMs = Date.parse(input.now);
  const requestedFreshnessWindow = input.freshnessWindowMs ?? DEFAULT_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowValid = Number.isInteger(requestedFreshnessWindow)
    && requestedFreshnessWindow > 0
    && requestedFreshnessWindow <= MAX_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowMs = freshnessWindowValid
    ? requestedFreshnessWindow
    : DEFAULT_PR_AUDIT_FRESHNESS_MS;

  if (Number.isNaN(nowMs)) {
    addFinding(
      findings,
      'blocker',
      'evidence_time_unknown',
      'The audit clock is malformed, so evidence freshness cannot be established.',
    );
  }
  if (!freshnessWindowValid) {
    addFinding(
      findings,
      'blocker',
      'invalid_freshness_window',
      'The freshness window must be a positive whole number no greater than one hour.',
    );
  }

  const baseSha = normalizedSha(input.pullRequest.baseSha);
  const headSha = normalizedSha(input.pullRequest.headSha);
  const expectedHeadSha = input.pullRequest.expectedHeadSha === undefined
    ? undefined
    : normalizedSha(input.pullRequest.expectedHeadSha);
  const finalHeadSha = input.pullRequest.finalHeadSha === undefined
    ? undefined
    : normalizedSha(input.pullRequest.finalHeadSha);

  if (!baseSha || !headSha) {
    addFinding(
      findings,
      'blocker',
      'malformed_pull_request_sha',
      'Pull request base and head identities must both be full 40-character Git SHAs.',
    );
  }
  if (input.pullRequest.expectedHeadSha !== undefined && !expectedHeadSha) {
    addFinding(
      findings,
      'blocker',
      'malformed_expected_head_sha',
      'The expected head identity must be a full 40-character Git SHA when supplied.',
    );
  }
  if (input.pullRequest.finalHeadSha !== undefined && !finalHeadSha) {
    addFinding(
      findings,
      'blocker',
      'malformed_final_head_sha',
      'The final head identity must be a full 40-character Git SHA when supplied.',
    );
  }

  const expectedHeadMatches = expectedHeadSha === undefined
    || (headSha !== null && expectedHeadSha === headSha);
  const finalHeadMatches = finalHeadSha === undefined
    || (headSha !== null && finalHeadSha === headSha);
  if (!expectedHeadMatches) {
    addFinding(
      findings,
      'blocker',
      'expected_head_sha_mismatch',
      'The provider-observed pull request head does not match the caller-bound expected head.',
    );
  }
  if (!finalHeadMatches) {
    addFinding(
      findings,
      'blocker',
      'head_sha_changed_during_audit',
      'The pull request head changed between the initial and final provider observations.',
    );
  }
  if (input.pullRequest.state !== 'open') {
    addFinding(
      findings,
      'blocker',
      'pull_request_not_open',
      'Only an open pull request can produce complete current audit evidence.',
    );
  }

  const signals: SourcedObservation[] = [
    ...input.checks.map((observation) => ({ source: 'check' as const, observation })),
    ...input.workflows.map((observation) => ({ source: 'workflow' as const, observation })),
  ];
  if (signals.length === 0) {
    addFinding(
      findings,
      'blocker',
      'ci_missing',
      'No CI check or workflow observations were supplied for the pull request head.',
    );
  }

  let hasFailedSignal = false;
  let hasPendingSignal = false;
  let hasUnknownSignal = false;
  let hasStaleSignal = false;
  let hasUnknownTime = false;
  let allSignalsBoundToHead = signals.length > 0 && headSha !== null;

  for (const { observation } of signals) {
    const signalSha = normalizedSha(observation.headSha);
    const signalBoundToHead = signalSha !== null && headSha !== null && signalSha === headSha;
    if (!signalSha) {
      allSignalsBoundToHead = false;
      hasUnknownSignal = true;
      addFinding(
        findings,
        'blocker',
        'ci_unbound_to_head_sha',
        'At least one CI observation lacks a valid full commit SHA.',
      );
    } else if (!headSha || signalSha !== headSha) {
      allSignalsBoundToHead = false;
      hasUnknownSignal = true;
      addFinding(
        findings,
        'blocker',
        'ci_stale_for_head_sha',
        'At least one CI observation references a commit other than the current pull request head.',
      );
    }

    if (signalBoundToHead) {
      const outcome = signalOutcome(observation);
      hasFailedSignal ||= outcome === 'fail';
      hasPendingSignal ||= outcome === 'pending';
      hasUnknownSignal ||= outcome === 'unknown';
    }

    if (!Number.isNaN(nowMs)) {
      const freshness = observationFreshness(observation.observedAt, nowMs, freshnessWindowMs);
      hasStaleSignal ||= freshness === 'stale';
      hasUnknownTime ||= freshness === 'unknown';
    } else {
      hasUnknownTime = true;
    }
  }

  const prFreshness = Number.isNaN(nowMs)
    ? 'unknown'
    : observationFreshness(input.pullRequest.observedAt, nowMs, freshnessWindowMs);
  hasStaleSignal ||= prFreshness === 'stale';
  hasUnknownTime ||= prFreshness === 'unknown';

  if (hasFailedSignal) {
    addFinding(
      findings,
      'blocker',
      'ci_failed',
      'At least one CI observation for this audit concluded unsuccessfully.',
    );
  }
  if (hasPendingSignal) {
    addFinding(
      findings,
      'warning',
      'ci_pending',
      'At least one CI observation is still queued or running.',
    );
  }
  if (hasUnknownSignal) {
    addFinding(
      findings,
      'blocker',
      'ci_unknown',
      'At least one CI observation cannot be classified as pass, fail, or pending.',
    );
  }
  if (hasStaleSignal) {
    addFinding(
      findings,
      'blocker',
      'evidence_stale',
      'At least one pull request or CI observation is older than the allowed freshness window.',
    );
  }
  if (hasUnknownTime) {
    addFinding(
      findings,
      'blocker',
      'evidence_time_unknown',
      'At least one pull request or CI observation has a malformed or future timestamp.',
    );
  }

  const signalsConflict = hasConflictingSignals(signals, headSha);
  const evidenceConflicted = !expectedHeadMatches
    || !finalHeadMatches
    || signalsConflict;
  if (signalsConflict) {
    addFinding(
      findings,
      'blocker',
      'ci_evidence_conflicted',
      'Duplicate CI identities report contradictory outcomes for the same commit.',
    );
  }

  const freshness: PrAuditFreshness = !freshnessWindowValid || hasUnknownTime
    ? 'unknown'
    : hasStaleSignal
      ? 'stale'
      : 'current';
  const ciConclusion: PrAuditCiConclusion = evidenceConflicted
    ? 'unknown'
    : hasFailedSignal
      ? 'fail'
      : hasPendingSignal
        ? 'pending'
        : hasUnknownSignal || signals.length === 0
          ? 'unknown'
          : 'pass';
  const complete = findings.size === 0
    && ciConclusion === 'pass'
    && allSignalsBoundToHead
    && freshness === 'current';

  return {
    verdict: evidenceConflicted
      ? 'evidence_conflicted'
      : complete
        ? 'evidence_complete'
        : 'evidence_incomplete',
    ciConclusion,
    findings: [...findings.values()].sort(findingsSorter),
    verification: {
      checkedAt: input.now,
      headShaBound: Boolean(headSha && expectedHeadMatches && finalHeadMatches),
      ciBoundToHeadSha: allSignalsBoundToHead,
      freshness,
    },
  };
}
