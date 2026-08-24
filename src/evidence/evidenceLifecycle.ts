export type EvidenceSource =
  | 'gmail'
  | 'github'
  | 'cloudflare'
  | 'supabase'
  | 'playwright';

export type VerificationState = 'intake_pending' | 'verified' | 'rejected';
export type LedgerState = 'unledgered' | 'ledgered';
export type EvidenceValidity = 'current' | 'stale' | 'superseded' | 'expired';
export type WorkflowConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'neutral'
  | 'skipped'
  | 'action_required'
  | 'stale'
  | 'startup_failure'
  | 'unknown';

export type EvidenceAction =
  | 'inspect'
  | 'create_evidence_task'
  | 'request_readonly_verification'
  | 'prepare_merge_review'
  | 'merge'
  | 'deploy'
  | 'promote_production'
  | 'close_issue'
  | 'modify_secret'
  | 'change_policy'
  | 'delete_data';

export interface EvidenceIntakeEvent {
  id: string;
  source: EvidenceSource;
  receivedAt: string;
  rawEvidenceRef: string;
  parsed: {
    repository?: string;
    workflow?: string;
    runId?: string;
    sha?: string;
    status?: string;
    subject?: string;
  };
  parser: {
    version: string;
    confidence: 'high' | 'medium' | 'low';
  };
  authority: {
    level: 'observation';
    verified: false;
  };
  verificationState: 'intake_pending';
  ledgerState: LedgerState;
}

export interface VerifiedEvidenceReceipt {
  id: string;
  intakeEventId?: string;
  verifier: {
    source: 'github_api' | 'cloudflare_api' | 'supabase_readback' | 'playwright';
    observedAt: string;
    evidenceRef: string;
  };
  authority: {
    level: 'authoritative_readback';
    readbackCompleted: true;
  };
  verdict: 'verified' | 'rejected';
  ledgerState: LedgerState;
  validity: EvidenceValidity;
  subject: {
    repository?: string;
    workflow?: string;
    runId?: string;
    sha?: string;
    workflowConclusion?: WorkflowConclusion;
    deploymentId?: string;
    runtimeIdentity?: string;
  };
  rejectionReason?: string;
  supersededBy?: string;
  expiresAt?: string;
}

export interface EvidenceAuthorityDecision {
  allowedActions: EvidenceAction[];
  forbiddenActions: EvidenceAction[];
  reasons: string[];
}

export interface MergeReviewTarget {
  repository: string;
  sha: string;
}

const HIGH_CONSEQUENCE_ACTIONS: EvidenceAction[] = [
  'merge',
  'deploy',
  'promote_production',
  'close_issue',
  'modify_secret',
  'change_policy',
  'delete_data',
];

const FULL_SHA = /^[0-9a-f]{40}$/i;
const MAX_FRESHNESS_LEASE_MS = 60 * 60 * 1000;

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function supportsMergeReview(receipt: VerifiedEvidenceReceipt, target: MergeReviewTarget): boolean {
  const { repository, workflow, runId, sha, workflowConclusion } = receipt.subject;
  const expectedRepository = target.repository.trim();
  const expectedSha = target.sha.trim().toLowerCase();
  return receipt.verifier.source === 'github_api'
    && isPresent(repository)
    && repository.trim() === expectedRepository
    && isPresent(workflow)
    && isPresent(runId)
    && isPresent(sha)
    && FULL_SHA.test(sha.trim())
    && FULL_SHA.test(expectedSha)
    && sha.trim().toLowerCase() === expectedSha
    && workflowConclusion === 'success';
}

function hasActiveFreshnessLease(receipt: VerifiedEvidenceReceipt, now: string): boolean {
  if (!isPresent(receipt.expiresAt) || !isPresent(receipt.verifier.observedAt)) return false;

  const observedAtMs = Date.parse(receipt.verifier.observedAt);
  const nowMs = Date.parse(now);
  const expiresAtMs = Date.parse(receipt.expiresAt);

  if ([observedAtMs, nowMs, expiresAtMs].some(Number.isNaN)) return false;
  if (observedAtMs >= expiresAtMs) return false;
  if (expiresAtMs - observedAtMs > MAX_FRESHNESS_LEASE_MS) return false;

  return observedAtMs <= nowMs && nowMs < expiresAtMs;
}

export function createEvidenceIntakeEvent(
  event: Omit<EvidenceIntakeEvent, 'authority' | 'verificationState' | 'ledgerState'> & {
    ledgerState?: LedgerState;
  },
): EvidenceIntakeEvent {
  return {
    ...event,
    authority: { level: 'observation', verified: false },
    verificationState: 'intake_pending',
    ledgerState: event.ledgerState ?? 'unledgered',
  };
}

export function authorityForIntakeEvent(): EvidenceAuthorityDecision {
  return {
    allowedActions: ['inspect', 'create_evidence_task', 'request_readonly_verification'],
    forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
    reasons: ['Intake events are observation-level claims and cannot authorize operational changes.'],
  };
}

export function authorityForVerifiedReceipt(
  receipt: VerifiedEvidenceReceipt,
  target: MergeReviewTarget,
  now = new Date().toISOString(),
): EvidenceAuthorityDecision {
  const reasons: string[] = [];
  const evaluatedReceipt = expireEvidenceReceipt(receipt, now);

  if (evaluatedReceipt.verdict !== 'verified') {
    reasons.push('Rejected evidence is audit information, not operational authority.');
    return {
      allowedActions: ['inspect', 'create_evidence_task'],
      forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
      reasons,
    };
  }

  if (evaluatedReceipt.ledgerState !== 'ledgered') {
    reasons.push('Authoritative evidence must be persisted before it can support governed action.');
    return {
      allowedActions: ['inspect', 'create_evidence_task'],
      forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
      reasons,
    };
  }

  if (isPresent(evaluatedReceipt.supersededBy)) {
    reasons.push('Evidence with a supersession marker cannot support governed action, even if its stored validity still says current.');
    return {
      allowedActions: ['inspect', 'create_evidence_task', 'request_readonly_verification'],
      forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
      reasons,
    };
  }

  if (!isPresent(evaluatedReceipt.expiresAt)) {
    reasons.push('Merge-review preparation requires an explicit freshness lease so authoritative evidence cannot remain current forever.');
    return {
      allowedActions: ['inspect', 'create_evidence_task', 'request_readonly_verification'],
      forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
      reasons,
    };
  }

  if (evaluatedReceipt.validity !== 'current') {
    reasons.push(`Evidence validity is ${evaluatedReceipt.validity}; current authority requires current evidence.`);
    return {
      allowedActions: ['inspect', 'create_evidence_task', 'request_readonly_verification'],
      forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
      reasons,
    };
  }

  if (!hasActiveFreshnessLease(evaluatedReceipt, now)) {
    reasons.push('Merge-review preparation requires an active freshness lease with observedAt <= now < expiresAt, observedAt < expiresAt, and a maximum lifetime of 60 minutes.');
    return {
      allowedActions: ['inspect', 'create_evidence_task', 'request_readonly_verification'],
      forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
      reasons,
    };
  }

  if (!supportsMergeReview(evaluatedReceipt, target)) {
    reasons.push('Merge-review preparation requires successful GitHub API workflow readback bound to the expected repository and exact target SHA, plus workflow and run identity.');
    return {
      allowedActions: ['inspect', 'create_evidence_task', 'request_readonly_verification'],
      forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
      reasons,
    };
  }

  reasons.push('Receipt is authoritative, ledgered, current, freshness-bounded, and scoped to the expected repository and exact target SHA with a successful GitHub workflow identity.');
  return {
    allowedActions: ['inspect', 'create_evidence_task', 'request_readonly_verification', 'prepare_merge_review'],
    forbiddenActions: [...HIGH_CONSEQUENCE_ACTIONS],
    reasons,
  };
}

export function supersedeEvidenceReceipt(
  receipt: VerifiedEvidenceReceipt,
  supersededBy: string,
): VerifiedEvidenceReceipt {
  const normalizedSupersededBy = supersededBy.trim();
  const normalizedReceiptId = receipt.id.trim();
  if (!normalizedSupersededBy) throw new Error('supersededBy receipt id is required.');
  if (normalizedSupersededBy === normalizedReceiptId) throw new Error('A receipt cannot supersede itself.');
  if (receipt.validity === 'superseded' || isPresent(receipt.supersededBy)) {
    throw new Error('A receipt supersession edge is immutable once assigned.');
  }

  return {
    ...receipt,
    validity: 'superseded',
    supersededBy: normalizedSupersededBy,
  };
}

export function expireEvidenceReceipt(
  receipt: VerifiedEvidenceReceipt,
  now = new Date().toISOString(),
): VerifiedEvidenceReceipt {
  if (!receipt.expiresAt) return receipt;
  const nowMs = Date.parse(now);
  const expiresAtMs = Date.parse(receipt.expiresAt);
  if (Number.isNaN(nowMs) || Number.isNaN(expiresAtMs)) {
    throw new Error('Evidence expiration timestamps must be valid ISO timestamps.');
  }
  if (expiresAtMs > nowMs) return receipt;
  return { ...receipt, validity: 'expired' };
}
