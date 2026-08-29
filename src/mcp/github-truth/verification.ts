import type {
  AuditFinding,
  EvaluatePrAuditEvidenceInput,
  NormalizedCheck,
  PrAuditEvaluation,
  RequiredCheckIdentity,
} from './types.js';

export const DEFAULT_PR_AUDIT_FRESHNESS_MS = 5 * 60 * 1000;
export const MAX_PR_AUDIT_FRESHNESS_MS = 60 * 60 * 1000;

const FULL_SHA = /^[0-9a-f]{40}$/i;
const PENDING = new Set(['queued', 'requested', 'waiting', 'in_progress', 'pending']);

type Outcome =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'neutral'
  | 'skipped'
  | 'pending'
  | 'unknown';

function normalizedSha(value: string | null): string | null {
  const sha = value?.trim().toLowerCase() ?? '';
  return FULL_SHA.test(sha) ? sha : null;
}

function normalizedContext(value: string): string {
  return value.trim();
}

function sortedUnique(findings: readonly AuditFinding[]): AuditFinding[] {
  return [...new Set(findings)].sort((a, b) => a.localeCompare(b));
}

export function isSameRequiredIdentity(
  requirement: RequiredCheckIdentity,
  observation: NormalizedCheck,
): boolean {
  if (requirement.kind !== observation.kind) return false;
  if (normalizedContext(requirement.context) !== normalizedContext(observation.context)) return false;
  // appId omission is intentionally app-agnostic for v0. When a requirement
  // specifies appId, the observation must carry that exact app identity.
  if (requirement.appId !== undefined) return requirement.appId === observation.appId;
  return true;
}

function outcomeOf(observation: NormalizedCheck): Outcome {
  const status = observation.status?.trim().toLowerCase() ?? '';
  const conclusion = observation.conclusion?.trim().toLowerCase() ?? '';

  if (PENDING.has(status)) return 'pending';

  // Commit statuses are normalized by providers into status values such as
  // success/failure/error and do not require a separate completed marker.
  if (observation.kind === 'commit_status') {
    if (status === 'success') return 'success';
    if (status === 'failure' || status === 'error') return 'failed';
    if (status === 'cancelled') return 'cancelled';
    if (status === 'neutral') return 'neutral';
    if (status === 'skipped') return 'skipped';
    return 'unknown';
  }

  if (status !== 'completed') return 'unknown';
  if (conclusion === 'success') return 'success';
  if (
    conclusion === 'failure'
    || conclusion === 'timed_out'
    || conclusion === 'action_required'
    || conclusion === 'stale'
    || conclusion === 'startup_failure'
  ) return 'failed';
  if (conclusion === 'cancelled') return 'cancelled';
  if (conclusion === 'neutral') return 'neutral';
  if (conclusion === 'skipped') return 'skipped';
  return 'unknown';
}

function findingForOutcome(outcome: Outcome): AuditFinding | null {
  switch (outcome) {
    case 'success': return null;
    case 'failed': return 'required_check_failed';
    case 'cancelled': return 'required_check_cancelled';
    case 'neutral': return 'required_check_neutral';
    case 'skipped': return 'required_check_skipped';
    case 'pending': return 'required_check_pending';
    case 'unknown': return 'required_check_unknown';
  }
}

function freshnessOf(
  observedAt: string | null,
  auditedAtMs: number,
  freshnessWindowMs: number,
): 'fresh' | 'stale' | 'unknown' {
  if (!observedAt) return 'unknown';
  const observedAtMs = Date.parse(observedAt);
  if (Number.isNaN(observedAtMs) || observedAtMs > auditedAtMs) return 'unknown';
  return auditedAtMs - observedAtMs <= freshnessWindowMs ? 'fresh' : 'stale';
}

function terminalConflict(observations: readonly NormalizedCheck[]): boolean {
  const outcomes = new Set<Outcome>();
  for (const observation of observations) {
    const outcome = outcomeOf(observation);
    if (outcome !== 'pending' && outcome !== 'unknown') outcomes.add(outcome);
  }
  return outcomes.size > 1;
}

function pushFreshnessFinding(
  observation: NormalizedCheck,
  findings: AuditFinding[],
  auditedAtMs: number,
  freshnessWindowMs: number,
): void {
  const freshness = freshnessOf(observation.observedAt, auditedAtMs, freshnessWindowMs);
  if (freshness === 'stale') findings.push('ci_observation_stale');
  if (freshness === 'unknown') findings.push('ci_observation_time_unknown');
}

export function evaluatePrAuditEvidence(input: EvaluatePrAuditEvidenceInput): PrAuditEvaluation {
  const findings: AuditFinding[] = [...(input.findings ?? [])];
  const auditedAtMs = Date.parse(input.auditedAt);
  const requestedWindow = input.freshnessWindowMs ?? DEFAULT_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowValid = Number.isInteger(requestedWindow)
    && requestedWindow > 0
    && requestedWindow <= MAX_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowMs = freshnessWindowValid
    ? requestedWindow
    : DEFAULT_PR_AUDIT_FRESHNESS_MS;

  if (Number.isNaN(auditedAtMs)) findings.push('invalid_audit_time');
  if (!freshnessWindowValid) findings.push('invalid_freshness_window');

  const initialHeadSha = normalizedSha(input.initialPr.headSha);
  const finalHeadSha = normalizedSha(input.finalPr.headSha);
  if (!initialHeadSha || !finalHeadSha) findings.push('pr_head_sha_malformed');
  if (input.initialPr.state !== 'open' || input.finalPr.state !== 'open') findings.push('pr_not_open');

  const headsConflict = Boolean(
    initialHeadSha
    && finalHeadSha
    && initialHeadSha !== finalHeadSha,
  );
  if (headsConflict) findings.push('pr_head_changed_during_collection');

  const discoveryComplete = input.requiredChecks.state === 'complete';
  if (!discoveryComplete) {
    findings.push('required_check_visibility_incomplete');
    findings.push(...input.requiredChecks.findings);
  }

  const currentHeadSha = finalHeadSha;
  const canEvaluateChecks = Boolean(
    !Number.isNaN(auditedAtMs)
    && freshnessWindowValid
    && initialHeadSha
    && finalHeadSha
    && !headsConflict
    && discoveryComplete,
  );

  if (canEvaluateChecks && currentHeadSha) {
    const required = input.requiredChecks.requiredChecks;

    // In v0, an explicitly empty required set does not establish complete
    // evidence unless the caller opts into the separate future 'allow' policy.
    // Unrelated checks are never a substitute for an explicitly modeled witness.
    if (
      required.length === 0
      && (input.emptyRequiredSetPolicy ?? 'require_observation') !== 'allow'
    ) {
      findings.push('required_check_missing');
    }

    for (const requirement of required) {
      const candidates = input.checks.filter((item) => isSameRequiredIdentity(requirement, item));

      for (const candidate of candidates) {
        if (candidate.headSha !== null && !normalizedSha(candidate.headSha)) {
          findings.push('ci_head_sha_malformed');
        }
      }

      const current = candidates.filter(
        (item) => normalizedSha(item.headSha) === currentHeadSha,
      );

      if (current.length === 0) {
        const hasPriorHead = candidates.some((item) => {
          const sha = normalizedSha(item.headSha);
          return sha !== null && sha !== currentHeadSha;
        });
        findings.push(hasPriorHead ? 'ci_stale_for_head_sha' : 'required_check_missing');
        continue;
      }

      if (terminalConflict(current)) {
        findings.push('duplicate_current_head_check_conflict');
        continue;
      }

      let sawSuccess = false;
      let sawPending = false;
      let sawUnknown = false;
      for (const observation of current) {
        pushFreshnessFinding(observation, findings, auditedAtMs, freshnessWindowMs);
        const outcome = outcomeOf(observation);
        sawSuccess ||= outcome === 'success';
        sawPending ||= outcome === 'pending';
        sawUnknown ||= outcome === 'unknown';
        const outcomeFinding = findingForOutcome(outcome);
        if (outcomeFinding && outcome !== 'pending' && outcome !== 'unknown') {
          findings.push(outcomeFinding);
        }
      }

      // Every relevant current-head observation must be resolved. A successful
      // duplicate cannot hide another pending or unknown observation.
      if (sawPending) findings.push('required_check_pending');
      if (sawUnknown) findings.push('required_check_unknown');
      if (!sawSuccess && !sawPending && !sawUnknown && current.length > 0) {
        const fallback = findingForOutcome(outcomeOf(current[0]!));
        if (fallback) findings.push(fallback);
      }
    }
  }

  const normalizedFindings = sortedUnique(findings);
  const conflicted = normalizedFindings.includes('pr_head_changed_during_collection')
    || normalizedFindings.includes('duplicate_current_head_check_conflict');

  return {
    state: conflicted
      ? 'evidence_conflicted'
      : normalizedFindings.length === 0
        ? 'evidence_complete'
        : 'evidence_incomplete',
    currentHeadSha,
    requiredCheckCoverage: discoveryComplete ? 'complete' : 'incomplete',
    findings: normalizedFindings,
  };
}
