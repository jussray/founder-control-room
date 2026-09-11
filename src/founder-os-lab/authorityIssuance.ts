import { createHash, randomUUID } from 'node:crypto';
import {
  AUTHORITY_ENVELOPE_CONTRACT,
  authorityEnvelopeHash,
  capabilityIdentity,
  type AuthorityEnvelopeV1,
} from './authorityKernel.js';

const DEFAULT_AUTHORITY_TTL_MS = 15 * 60 * 1_000;

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface CreateBranchAuthorityInput {
  missionId: string;
  projectId: string;
  actor: string;
  approvedBy: string;
  idempotencyKey: string;
  baseRef: string;
  branchName: string;
  state: {
    missionStatus: string;
    policySnapshot: Record<string, unknown> | null;
  };
  proof: {
    id: string;
    gateId: string;
    createdAt: string;
  };
  now?: string;
  ttlMs?: number;
  toolCallId?: string;
}

export interface IssuedCreateBranchAuthority {
  envelope: AuthorityEnvelopeV1;
  context: {
    now: string;
    proposalHash: string;
    argumentsHash: string;
    stateFingerprint: string;
    toolCallId: string;
  };
}

/**
 * Server-side issuance for the first governed repository mutation.
 *
 * No caller supplies hashes or capability identity. FCR derives them from the
 * authenticated founder, fresh proof receipt, exact proposed arguments, and
 * observed mission state. The returned context is the execution-time binding
 * that must be re-derived/revalidated immediately before provider mutation.
 */
export function issueCreateBranchAuthority(input: CreateBranchAuthorityInput): IssuedCreateBranchAuthority {
  if (!input.missionId.trim() || !input.projectId.trim()) throw new Error('mission and project identity are required');
  if (!input.actor.trim() || !input.approvedBy.trim()) throw new Error('authenticated actor and approver are required');
  if (!input.idempotencyKey.trim()) throw new Error('idempotency key is required');
  if (!input.baseRef.trim() || !input.branchName.trim()) throw new Error('baseRef and branchName are required');
  if (input.proof.gateId !== 'create_branch') throw new Error('create_branch authority requires create_branch proof');

  const now = input.now ?? new Date().toISOString();
  const issuedAtMs = Date.parse(now);
  if (!Number.isFinite(issuedAtMs)) throw new Error('issuance time must be a valid ISO date');
  const ttlMs = input.ttlMs ?? DEFAULT_AUTHORITY_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > DEFAULT_AUTHORITY_TTL_MS) {
    throw new Error('authority ttl must be positive and no greater than 15 minutes');
  }

  const capability = capabilityIdentity('github.repository.create_branch');
  const proposalHash = sha256({
    missionId: input.missionId,
    projectId: input.projectId,
    capability: capability.id,
    proofId: input.proof.id,
    proofGate: input.proof.gateId,
    proofCreatedAt: input.proof.createdAt,
  });
  const argumentsHash = sha256({ baseRef: input.baseRef, branchName: input.branchName });
  const stateFingerprint = sha256({
    missionId: input.missionId,
    projectId: input.projectId,
    missionStatus: input.state.missionStatus,
    policySnapshot: input.state.policySnapshot ?? {},
  });
  const toolCallId = input.toolCallId ?? randomUUID();

  const unsigned: Omit<AuthorityEnvelopeV1, 'envelopeHash'> = {
    contract: AUTHORITY_ENVELOPE_CONTRACT,
    intentId: input.missionId,
    actor: input.actor,
    capability,
    authorityScope: `repository:${input.projectId}:branch:create`,
    proposalHash,
    argumentsHash,
    stateFingerprint,
    consequenceClass: 'reversible',
    toolCallId,
    issuedAt: now,
    expiresAt: new Date(issuedAtMs + ttlMs).toISOString(),
    approvedBy: input.approvedBy,
    idempotencyKey: input.idempotencyKey,
  };
  const envelope: AuthorityEnvelopeV1 = Object.freeze({
    ...unsigned,
    envelopeHash: authorityEnvelopeHash(unsigned),
  });

  return {
    envelope,
    context: { now, proposalHash, argumentsHash, stateFingerprint, toolCallId },
  };
}
