import { createHash } from 'node:crypto';
import {
  AUTHORITY_ENVELOPE_CONTRACT,
  authorityEnvelopeHash,
  capabilityIdentity,
  type AuthorityEnvelopeV1,
} from './authorityKernel.js';

const DEFAULT_AUTHORITY_TTL_MS = 15 * 60 * 1_000;
const UTC_ISO_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isoFromEpochMs(epochMs: number): string {
  const parts = Object.fromEntries(
    UTC_ISO_FORMATTER
      .formatToParts(epochMs)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const milliseconds = (((Math.trunc(epochMs) % 1_000) + 1_000) % 1_000).toString().padStart(3, '0');
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}:${parts['second']}.${milliseconds}Z`;
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

export interface CreateBranchAuthorityContext {
  now: string;
  capabilityId: string;
  proposalHash: string;
  argumentsHash: string;
  stateFingerprint: string;
  toolCallId: string;
}

export interface IssuedCreateBranchAuthority {
  envelope: AuthorityEnvelopeV1;
  context: CreateBranchAuthorityContext;
}

function validateCreateBranchAuthorityInput(input: CreateBranchAuthorityInput): void {
  if (!input.missionId.trim() || !input.projectId.trim()) throw new Error('mission and project identity are required');
  if (!input.actor.trim() || !input.approvedBy.trim()) throw new Error('authenticated actor and approver are required');
  if (!input.idempotencyKey.trim()) throw new Error('idempotency key is required');
  if (!input.baseRef.trim() || !input.branchName.trim()) throw new Error('baseRef and branchName are required');
  if (input.proof.gateId !== 'create_branch') throw new Error('create_branch authority requires create_branch proof');
}

/**
 * Re-derives the execution binding from current server-observed state.
 * This does not mint authority. It exists so the exact envelope issued from
 * the founder-approved request can be checked again immediately before the
 * provider mutation without trusting stale caller state.
 */
export function createBranchAuthorityContext(
  input: CreateBranchAuthorityInput & { now: string; toolCallId: string },
): CreateBranchAuthorityContext {
  validateCreateBranchAuthorityInput(input);
  const capability = capabilityIdentity('github.repository.create-branch');
  return {
    now: input.now,
    capabilityId: capability.id,
    proposalHash: sha256({
      missionId: input.missionId,
      projectId: input.projectId,
      capability: capability.id,
      proofId: input.proof.id,
      proofGate: input.proof.gateId,
      proofCreatedAt: input.proof.createdAt,
    }),
    argumentsHash: sha256({ baseRef: input.baseRef, branchName: input.branchName }),
    stateFingerprint: sha256({
      missionId: input.missionId,
      projectId: input.projectId,
      missionStatus: input.state.missionStatus,
      policySnapshot: input.state.policySnapshot ?? {},
    }),
    toolCallId: input.toolCallId,
  };
}

/**
 * Deterministic server-side issuance for the first governed repository mutation.
 *
 * The lab never reads the wall clock or generates randomness. Unless the runtime
 * supplies stricter values, issuance is anchored to the server proof timestamp
 * and the tool-call identity is derived from the already-bound idempotency key.
 * Expiry formatting is a pure transformation of that supplied timestamp.
 */
export function issueCreateBranchAuthority(input: CreateBranchAuthorityInput): IssuedCreateBranchAuthority {
  validateCreateBranchAuthorityInput(input);

  const now = input.now ?? input.proof.createdAt;
  const issuedAtMs = Date.parse(now);
  if (!Number.isFinite(issuedAtMs)) throw new Error('issuance time must be a valid ISO date');
  const ttlMs = input.ttlMs ?? DEFAULT_AUTHORITY_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > DEFAULT_AUTHORITY_TTL_MS) {
    throw new Error('authority ttl must be positive and no greater than 15 minutes');
  }

  const toolCallId = input.toolCallId ?? `approval-execution:${input.idempotencyKey}`;
  const context = createBranchAuthorityContext({ ...input, now, toolCallId });
  const capability = capabilityIdentity(context.capabilityId);

  const unsigned: Omit<AuthorityEnvelopeV1, 'envelopeHash'> = {
    contract: AUTHORITY_ENVELOPE_CONTRACT,
    intentId: input.missionId,
    actor: input.actor,
    capability,
    authorityScope: `repository:${input.projectId}:branch:create`,
    proposalHash: context.proposalHash,
    argumentsHash: context.argumentsHash,
    stateFingerprint: context.stateFingerprint,
    consequenceClass: 'reversible',
    toolCallId,
    issuedAt: now,
    expiresAt: isoFromEpochMs(issuedAtMs + ttlMs),
    approvedBy: input.approvedBy,
    idempotencyKey: input.idempotencyKey,
  };
  const envelope: AuthorityEnvelopeV1 = Object.freeze({
    ...unsigned,
    envelopeHash: authorityEnvelopeHash(unsigned),
  });

  return { envelope, context };
}
