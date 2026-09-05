import { createHash } from 'node:crypto';
import type { ContinuityInspection } from '../lib/ultrathinkContinuity.js';
import {
  evaluateGovernedAction,
  type GovernedActionRequest,
  type GovernedActionVerdict,
  type ProofContract,
} from './governedIntelligence.js';

export const CONSEQUENTIAL_RESUME_REQUIRES_CONTRACT = 'fcr/consequential-resume-requires@v1' as const;

export type ConsequentialResumeDisposition = 'eligible' | 'reconfirm' | 'deny' | 'blocked';
export type IdempotencyReplayState = 'unused' | 'consumed' | 'unknown';
export type IndependentWitnessKind =
  | 'provider_readback'
  | 'database_readback'
  | 'runtime_probe'
  | 'browser_witness'
  | 'repository_readback';

export interface IndependentEvidenceWitness {
  witnessId: string;
  proofId: string;
  kind: IndependentWitnessKind;
  artifactHash: string;
  observedAt: string;
  freshForMs: number;
}

export type ConsequentialGovernedActionRequest = GovernedActionRequest & {
  risk: 'consequential';
  proposalId: string;
  proposalHash: string;
  actionHash: string;
  exactVersion: string;
};

export interface ConsequentialResumeInput {
  continuity: ContinuityInspection;
  action: ConsequentialGovernedActionRequest;
  idempotency: {
    key: string;
    replayState: IdempotencyReplayState;
  };
  independentEvidence: IndependentEvidenceWitness[];
  now?: Date;
}

export interface ConsequentialResumeResult {
  contract: typeof CONSEQUENTIAL_RESUME_REQUIRES_CONTRACT;
  disposition: ConsequentialResumeDisposition;
  executionEligible: boolean;
  executionPerformed: false;
  continuityAuthorityTransferred: false;
  reasons: string[];
  expectedIdempotencyKey: string | null;
  governance: GovernedActionVerdict | null;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const STATE_HASH = /^sha256:[0-9a-f]{64}$/i;
const MAX_WITNESS_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const IDEMPOTENCY_PREFIX = 'fcr-consequential-resume-v1:';
const INDEPENDENT_WITNESS_KINDS = new Set<IndependentWitnessKind>([
  'provider_readback',
  'database_readback',
  'runtime_probe',
  'browser_witness',
  'repository_readback',
]);

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function result(
  disposition: ConsequentialResumeDisposition,
  reasons: string[],
  expectedIdempotencyKey: string | null,
  governance: GovernedActionVerdict | null = null,
): ConsequentialResumeResult {
  return {
    contract: CONSEQUENTIAL_RESUME_REQUIRES_CONTRACT,
    disposition,
    executionEligible: disposition === 'eligible',
    executionPerformed: false,
    continuityAuthorityTransferred: false,
    reasons,
    expectedIdempotencyKey,
    governance,
  };
}

export function consequentialResumeIdempotencyKey(input: {
  continuationId: string;
  stateHash: string;
  proposalHash: string;
  actionHash: string;
  exactVersion: string;
}): string {
  if (!input.continuationId.trim()) throw new Error('CONSEQUENTIAL_RESUME_CONTINUATION_ID_REQUIRED');
  if (!STATE_HASH.test(input.stateHash)) throw new Error('CONSEQUENTIAL_RESUME_STATE_HASH_INVALID');
  if (!HASH.test(input.proposalHash) || !HASH.test(input.actionHash)) {
    throw new Error('CONSEQUENTIAL_RESUME_ACTION_BINDING_HASH_INVALID');
  }
  if (!FULL_SHA.test(input.exactVersion)) throw new Error('CONSEQUENTIAL_RESUME_EXACT_VERSION_INVALID');

  return `${IDEMPOTENCY_PREFIX}${digest({
    contract: CONSEQUENTIAL_RESUME_REQUIRES_CONTRACT,
    continuationId: input.continuationId,
    stateHash: input.stateHash.toLowerCase(),
    proposalHash: input.proposalHash.toLowerCase(),
    actionHash: input.actionHash.toLowerCase(),
    exactVersion: input.exactVersion.toLowerCase(),
  })}`;
}

function continuityFailure(continuity: ContinuityInspection): ConsequentialResumeResult | null {
  if (!continuity.record) {
    return result('blocked', ['Continuity record is unavailable.'], null);
  }

  if (
    continuity.continuityMayAuthorizeAction !== false
    || continuity.record.executionAuthority !== false
    || continuity.record.proofCookie.actionAuthority !== false
  ) {
    return result('deny', ['Continuity or its proof cookie attempted to carry action authority.'], null);
  }

  switch (continuity.classification) {
    case 'BLOCKED':
      return result('blocked', ['Continuity inspection is blocked.', ...continuity.reasons], null);
    case 'REVOKED':
    case 'DIVERGED':
    case 'CONFLICTING':
      return result('deny', [`Continuity classification ${continuity.classification} cannot resume consequential work.`, ...continuity.reasons], null);
    case 'STALE':
    case 'ADVANCED':
      return result('reconfirm', [`Continuity classification ${continuity.classification} requires fresh founder re-confirmation.`, ...continuity.reasons], null);
    case 'UNCHANGED':
      if (!continuity.reasons.includes('authority_reobserved_unchanged')) {
        return result('reconfirm', ['Consequential resume requires an explicit fresh authority re-observation; a lease alone is insufficient.'], null);
      }
      return null;
  }
}

function witnessSupportsProof(
  witness: IndependentEvidenceWitness,
  proof: ProofContract,
  now: Date,
): { supported: boolean; reason: string } {
  if (!witness.witnessId.trim()) return { supported: false, reason: 'Independent witness identity is missing.' };
  if (witness.witnessId === proof.id) return { supported: false, reason: 'Independent witness must have an identity distinct from the proof it observes.' };
  if (!INDEPENDENT_WITNESS_KINDS.has(witness.kind)) return { supported: false, reason: 'Independent witness kind is unsupported.' };
  if (witness.proofId !== proof.id) return { supported: false, reason: 'Independent witness is bound to a different proof.' };
  if (!HASH.test(witness.artifactHash) || witness.artifactHash.toLowerCase() !== proof.artifactHash.toLowerCase()) {
    return { supported: false, reason: 'Independent witness artifact hash does not bind to the selected proof artifact.' };
  }
  if (!Number.isFinite(witness.freshForMs) || witness.freshForMs <= 0 || witness.freshForMs > MAX_WITNESS_FRESHNESS_MS) {
    return { supported: false, reason: 'Independent witness freshness window is invalid for consequential resume.' };
  }
  const observedAt = Date.parse(witness.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > now.getTime() + FUTURE_SKEW_MS) {
    return { supported: false, reason: 'Independent witness observation time is invalid or future-dated.' };
  }
  if (now.getTime() - observedAt > witness.freshForMs) {
    return { supported: false, reason: 'Independent witness is stale.' };
  }
  return { supported: true, reason: 'Independent witness is fresh and artifact-bound to the selected proof.' };
}

export function evaluateConsequentialResume(input: ConsequentialResumeInput): ConsequentialResumeResult {
  const now = input.now ?? new Date();
  const continuityGate = continuityFailure(input.continuity);
  if (continuityGate) return continuityGate;

  const record = input.continuity.record;
  if (!record) return result('blocked', ['Continuity record disappeared during evaluation.'], null);

  if (input.action.risk !== 'consequential') {
    return result('deny', ['This contract evaluates consequential resume only.'], null);
  }

  const authoritySha = record.authorityIdentity.sha?.toLowerCase() ?? null;
  if (!authoritySha || !FULL_SHA.test(authoritySha)) {
    return result('blocked', ['Continuity authority does not carry a valid exact source SHA.'], null);
  }
  if (input.action.exactVersion.toLowerCase() !== authoritySha) {
    return result('reconfirm', ['The proposed consequential action is not bound to the freshly re-observed continuity authority version.'], null);
  }

  let expectedIdempotencyKey: string;
  try {
    expectedIdempotencyKey = consequentialResumeIdempotencyKey({
      continuationId: record.continuationId,
      stateHash: record.stateHash,
      proposalHash: input.action.proposalHash,
      actionHash: input.action.actionHash,
      exactVersion: input.action.exactVersion,
    });
  } catch (error) {
    return result('blocked', [error instanceof Error ? error.message : 'Consequential resume idempotency binding is invalid.'], null);
  }

  if (input.idempotency.key !== expectedIdempotencyKey) {
    return result('reconfirm', ['Idempotency key does not match the exact continuity/proposal/action/version binding.'], expectedIdempotencyKey);
  }
  if (input.idempotency.replayState !== 'unused') {
    return result('reconfirm', [`Idempotency replay state is ${input.idempotency.replayState}; unused must be independently established before execution eligibility.`], expectedIdempotencyKey);
  }

  const governance = evaluateGovernedAction({ ...input.action, now });
  if (governance.decision === 'deny') {
    return result('deny', ['Existing FCR governed-action contract denied the consequential action.', ...governance.reasons], expectedIdempotencyKey, governance);
  }
  if (governance.decision !== 'allow') {
    return result('reconfirm', ['Existing FCR governed-action contract requires re-confirmation.', ...governance.reasons], expectedIdempotencyKey, governance);
  }

  const requiredClaims = input.action.requiredClaims ?? [];
  const selectedProofIds = [...new Set(governance.lineage.proofIds)];
  if (requiredClaims.length === 0 || selectedProofIds.length === 0) {
    return result('reconfirm', ['Consequential resume requires at least one claim-scoped proof and independent witness.'], expectedIdempotencyKey, governance);
  }

  const witnessesByProof = new Map<string, IndependentEvidenceWitness[]>();
  for (const witness of input.independentEvidence) {
    const list = witnessesByProof.get(witness.proofId) ?? [];
    list.push(witness);
    witnessesByProof.set(witness.proofId, list);
  }

  for (const proofId of selectedProofIds) {
    const proof = (input.action.proofs ?? []).find((candidate) => candidate.id === proofId);
    if (!proof) {
      return result('blocked', [`Governance selected proof ${proofId}, but the proof is unavailable for independent witness binding.`], expectedIdempotencyKey, governance);
    }
    const witnesses = witnessesByProof.get(proofId) ?? [];
    const supported = witnesses.some((witness) => witnessSupportsProof(witness, proof, now).supported);
    if (!supported) {
      const reasons = witnesses.length === 0
        ? [`No independent witness is bound to selected proof ${proofId}.`]
        : witnesses.map((witness) => `${proofId}: ${witnessSupportsProof(witness, proof, now).reason}`);
      return result('reconfirm', reasons, expectedIdempotencyKey, governance);
    }
  }

  return result(
    'eligible',
    [
      'Continuity authority was freshly re-observed unchanged.',
      'Existing FCR governed-action requirements are satisfied.',
      'Deterministic idempotency remains unused.',
      'Every selected proof has a fresh independent artifact-bound witness.',
      'Eligibility does not execute the action or transfer authority from continuity.',
    ],
    expectedIdempotencyKey,
    governance,
  );
}
