export const FEDERATED_PROOF_CONTRACT = 'juss-proof/v1' as const;

const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const SAFE_TOKEN = /^[A-Za-z0-9._:/-]{1,200}$/;
const SAFE_PROJECT = /^[A-Za-z0-9._/-]{1,160}$/;

export type FederatedProofState = 'verified' | 'inferred' | 'unknown' | 'failed' | 'blocked';
export type FederatedAuthorityMode = 'read' | 'write' | 'verify';

export interface FederatedProofAuthority {
  provider: string;
  scope: string;
  target: string;
  mode: FederatedAuthorityMode;
}

export interface FederatedExactTarget {
  repository?: string;
  branch?: string;
  sha?: string;
  environment?: string;
}

export interface FederatedProofEvidence {
  type: string;
  name: string;
  state: FederatedProofState;
  ref?: string;
  sha256?: string;
}

export interface FederatedProofReceipt {
  schema: typeof FEDERATED_PROOF_CONTRACT;
  receiptId: string;
  project: string;
  actor: string;
  authority: FederatedProofAuthority;
  exactTarget: FederatedExactTarget;
  operation: string;
  state: FederatedProofState;
  evidence: FederatedProofEvidence[];
  acknowledges: string[];
  dependsOn: string[];
  supersedes: string[];
  nextAuthority?: string;
  issuedAt: string;
}

export class FederatedProofContractError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FederatedProofContractError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new FederatedProofContractError('unknown_or_private_field');
  }
}

function safeText(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string') throw new FederatedProofContractError(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new FederatedProofContractError(`invalid_${field}`);
  }
  return normalized;
}

function safeToken(value: unknown, field: string): string {
  const normalized = safeText(value, field);
  if (!SAFE_TOKEN.test(normalized)) throw new FederatedProofContractError(`invalid_${field}`);
  return normalized;
}

function proofState(value: unknown, field = 'state'): FederatedProofState {
  if (value === 'verified' || value === 'inferred' || value === 'unknown' || value === 'failed' || value === 'blocked') {
    return value;
  }
  throw new FederatedProofContractError(`invalid_${field}`);
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40) {
    throw new FederatedProofContractError('invalid_issued_at');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FederatedProofContractError('invalid_issued_at');
  }
  return parsed.toISOString();
}

function normalizeReceiptId(value: unknown, field = 'receipt_id'): string {
  if (typeof value !== 'string' || !RECEIPT_ID.test(value)) {
    throw new FederatedProofContractError(`invalid_${field}`);
  }
  return value.toLowerCase();
}

function receiptReferences(value: unknown, field: string, selfId: string): string[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw new FederatedProofContractError(`invalid_${field}`);
  }
  const normalized = value.map((item) => normalizeReceiptId(item, field));
  if (new Set(normalized).size !== normalized.length || normalized.includes(selfId)) {
    throw new FederatedProofContractError(`invalid_${field}`);
  }
  return normalized;
}

function normalizeAuthority(value: unknown): FederatedProofAuthority {
  if (!isRecord(value)) throw new FederatedProofContractError('invalid_authority');
  exactKeys(value, ['provider', 'scope', 'target', 'mode']);
  const mode = value.mode;
  if (mode !== 'read' && mode !== 'write' && mode !== 'verify') {
    throw new FederatedProofContractError('invalid_authority_mode');
  }
  return {
    provider: safeToken(value.provider, 'authority_provider'),
    scope: safeToken(value.scope, 'authority_scope'),
    target: safeText(value.target, 'authority_target', 500),
    mode,
  };
}

function normalizeExactTarget(value: unknown, authority: FederatedProofAuthority): FederatedExactTarget {
  if (!isRecord(value)) throw new FederatedProofContractError('invalid_exact_target');
  exactKeys(value, ['repository', 'branch', 'sha', 'environment']);

  const repository = value.repository === undefined ? undefined : safeText(value.repository, 'target_repository', 300);
  const branch = value.branch === undefined ? undefined : safeText(value.branch, 'target_branch', 300);
  const environment = value.environment === undefined ? undefined : safeText(value.environment, 'target_environment', 160);
  let sha: string | undefined;
  if (value.sha !== undefined) {
    if (typeof value.sha !== 'string' || !COMMIT_SHA.test(value.sha)) {
      throw new FederatedProofContractError('invalid_target_sha');
    }
    sha = value.sha.toLowerCase();
  }

  if (!repository && !environment && !sha) {
    throw new FederatedProofContractError('empty_exact_target');
  }
  if (authority.scope === 'repository' && !repository) {
    throw new FederatedProofContractError('repository_target_required');
  }
  if ((authority.scope === 'repository' || authority.scope === 'deployment') && !sha) {
    throw new FederatedProofContractError('exact_sha_required');
  }

  return { repository, branch, sha, environment };
}

function normalizeEvidence(value: unknown): FederatedProofEvidence[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new FederatedProofContractError('invalid_evidence');
  }

  return value.map((item) => {
    if (!isRecord(item)) throw new FederatedProofContractError('invalid_evidence_item');
    exactKeys(item, ['type', 'name', 'state', 'ref', 'sha256']);
    let sha256: string | undefined;
    if (item.sha256 !== undefined) {
      if (typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)) {
        throw new FederatedProofContractError('invalid_evidence_sha256');
      }
      sha256 = item.sha256.toLowerCase();
    }
    return {
      type: safeToken(item.type, 'evidence_type'),
      name: safeText(item.name, 'evidence_name', 500),
      state: proofState(item.state, 'evidence_state'),
      ref: item.ref === undefined ? undefined : safeText(item.ref, 'evidence_ref', 1000),
      sha256,
    };
  });
}

export function validateFederatedProofReceipt(input: unknown): FederatedProofReceipt {
  if (!isRecord(input)) throw new FederatedProofContractError('invalid_body');
  exactKeys(input, [
    'schema',
    'receiptId',
    'project',
    'actor',
    'authority',
    'exactTarget',
    'operation',
    'state',
    'evidence',
    'acknowledges',
    'dependsOn',
    'supersedes',
    'nextAuthority',
    'issuedAt',
  ]);
  if (input.schema !== FEDERATED_PROOF_CONTRACT) {
    throw new FederatedProofContractError('unsupported_schema');
  }

  const receiptId = normalizeReceiptId(input.receiptId);
  const project = safeText(input.project, 'project', 160);
  if (!SAFE_PROJECT.test(project)) throw new FederatedProofContractError('invalid_project');
  const authority = normalizeAuthority(input.authority);

  return {
    schema: FEDERATED_PROOF_CONTRACT,
    receiptId,
    project,
    actor: safeToken(input.actor, 'actor'),
    authority,
    exactTarget: normalizeExactTarget(input.exactTarget, authority),
    operation: safeToken(input.operation, 'operation'),
    state: proofState(input.state),
    evidence: normalizeEvidence(input.evidence),
    acknowledges: receiptReferences(input.acknowledges, 'acknowledges', receiptId),
    dependsOn: receiptReferences(input.dependsOn, 'depends_on', receiptId),
    supersedes: receiptReferences(input.supersedes, 'supersedes', receiptId),
    nextAuthority: input.nextAuthority === undefined ? undefined : safeToken(input.nextAuthority, 'next_authority'),
    issuedAt: canonicalTimestamp(input.issuedAt),
  };
}

export function assertFederatedReceiptAcknowledgement(
  receiptInput: unknown,
  upstreamInput: unknown,
): void {
  const receipt = validateFederatedProofReceipt(receiptInput);
  const upstream = validateFederatedProofReceipt(upstreamInput);
  if (!receipt.acknowledges.includes(upstream.receiptId)) {
    throw new FederatedProofContractError('upstream_not_acknowledged');
  }
  if (receipt.project !== upstream.project) {
    throw new FederatedProofContractError('acknowledgement_project_mismatch');
  }
  if (receipt.exactTarget.sha && upstream.exactTarget.sha && receipt.exactTarget.sha !== upstream.exactTarget.sha) {
    throw new FederatedProofContractError('acknowledgement_sha_mismatch');
  }
}
