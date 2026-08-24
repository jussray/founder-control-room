export const AUTHORITY_RECEIPT_V2_CONTRACT = 'fcr/authority-receipt@v2' as const;

export type AuthorityReceiptV2Status =
  | 'active'
  | 'revoked'
  | 'superseded'
  | 'consumed';

export type AuthorityEvidenceClass =
  | 'repository'
  | 'ci'
  | 'runtime'
  | 'provider'
  | 'human-approval';

export type AuthorityReceiptV2 = Readonly<{
  contract: typeof AUTHORITY_RECEIPT_V2_CONTRACT;
  id: string;
  subject: Readonly<{
    repo: string;
    headSha: string;
    baseSha: string;
  }>;
  issuer: Readonly<{
    type: 'human' | 'agent' | 'system';
    id: string;
  }>;
  scope: readonly string[];
  action: Readonly<{
    type: string;
    target: string;
    digest: `sha256:${string}`;
  }>;
  evidence: readonly Readonly<{
    ref: string;
    class: AuthorityEvidenceClass;
  }>[];
  issuedAt: string;
  expiresAt: string;
  checkedAt: string;
  status: AuthorityReceiptV2Status;
  revokedAt?: string;
  revocationReason?: string;
  supersededBy?: string;
  consumedAt?: string;
}>;

export type AuthorityReceiptV2Failure =
  | 'invalid_contract'
  | 'invalid_status'
  | 'expired'
  | 'invalid_time'
  | 'invalid_subject'
  | 'missing_scope'
  | 'missing_action_binding'
  | 'invalid_digest'
  | 'missing_evidence'
  | 'revocation_incomplete'
  | 'supersession_incomplete'
  | 'current_authority_rejected'
  | 'already_consumed';

export type AuthorityReceiptV2Validation =
  | { ok: true; receipt: AuthorityReceiptV2 }
  | { ok: false; reason: AuthorityReceiptV2Failure };

export interface AuthorityReceiptV2CurrentAuthority {
  revalidate(receipt: AuthorityReceiptV2): Promise<boolean> | boolean;
}

export interface AuthorityReceiptV2ConsumptionStore {
  claim(receiptId: string, consumedAt: string): Promise<boolean> | boolean;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateAuthorityReceiptV2(
  receipt: AuthorityReceiptV2,
  now = new Date(),
): AuthorityReceiptV2Validation {
  if (receipt.contract !== AUTHORITY_RECEIPT_V2_CONTRACT) {
    return { ok: false, reason: 'invalid_contract' };
  }

  if (receipt.status !== 'active') {
    return { ok: false, reason: 'invalid_status' };
  }

  if (!validDate(receipt.issuedAt) || !validDate(receipt.expiresAt) || !validDate(receipt.checkedAt)) {
    return { ok: false, reason: 'invalid_time' };
  }

  if (new Date(receipt.expiresAt) <= now) {
    return { ok: false, reason: 'expired' };
  }

  if (
    !OWNED_REPO.test(receipt.subject.repo)
    || !FULL_SHA.test(receipt.subject.headSha)
    || !FULL_SHA.test(receipt.subject.baseSha)
  ) {
    return { ok: false, reason: 'invalid_subject' };
  }

  if (receipt.scope.length === 0 || receipt.scope.some((item) => !item.trim())) {
    return { ok: false, reason: 'missing_scope' };
  }

  if (!receipt.action.type.trim() || !receipt.action.target.trim()) {
    return { ok: false, reason: 'missing_action_binding' };
  }

  if (!SHA256.test(receipt.action.digest)) {
    return { ok: false, reason: 'invalid_digest' };
  }

  if (receipt.evidence.length === 0 || receipt.evidence.some((item) => !item.ref.trim())) {
    return { ok: false, reason: 'missing_evidence' };
  }

  if (receipt.revokedAt || receipt.revocationReason) {
    return { ok: false, reason: 'revocation_incomplete' };
  }

  if (receipt.supersededBy) {
    return { ok: false, reason: 'supersession_incomplete' };
  }

  return { ok: true, receipt };
}

export async function consumeAuthorityReceiptV2(input: {
  receipt: AuthorityReceiptV2;
  currentAuthority: AuthorityReceiptV2CurrentAuthority;
  store: AuthorityReceiptV2ConsumptionStore;
  now?: Date;
}): Promise<AuthorityReceiptV2Validation> {
  const now = input.now ?? new Date();
  const validation = validateAuthorityReceiptV2(input.receipt, now);
  if (!validation.ok) return validation;

  if (!(await input.currentAuthority.revalidate(input.receipt))) {
    return { ok: false, reason: 'current_authority_rejected' };
  }

  const consumedAt = now.toISOString();
  if (!(await input.store.claim(input.receipt.id, consumedAt))) {
    return { ok: false, reason: 'already_consumed' };
  }

  return {
    ok: true,
    receipt: Object.freeze({
      ...input.receipt,
      status: 'consumed',
      consumedAt,
      checkedAt: consumedAt,
    }),
  };
}
