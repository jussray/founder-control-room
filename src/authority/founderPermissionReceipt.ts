import {
  consumeAuthorityReceiptV2,
  validateAuthorityReceiptV2,
  type AuthorityReceiptV2,
  type AuthorityReceiptV2ConsumptionStore,
  type AuthorityReceiptV2Validation,
} from './authorityReceiptV2.js';

export const FOUNDER_PERMISSION_RECEIPT_CONTRACT = 'fcr/founder-permission@v1' as const;
export const FOUNDER_PERMISSION_ISSUER_ID = 'founder' as const;

export type FounderPermissionReceipt = AuthorityReceiptV2 & Readonly<{
  permissionContract: typeof FOUNDER_PERMISSION_RECEIPT_CONTRACT;
  issuer: Readonly<{
    type: 'human';
    id: typeof FOUNDER_PERMISSION_ISSUER_ID;
  }>;
}>;

export type FounderPermissionDecisionSnapshot = Readonly<{
  decisionId: string;
  founderId: typeof FOUNDER_PERMISSION_ISSUER_ID;
  subject: FounderPermissionReceipt['subject'];
  scope: readonly string[];
  action: FounderPermissionReceipt['action'];
  expiresAt: string;
  decision: 'approved';
}>;

export interface FounderPermissionCurrentAuthority {
  readDecision(receipt: FounderPermissionReceipt):
    | Promise<FounderPermissionDecisionSnapshot | null>
    | FounderPermissionDecisionSnapshot
    | null;
}

export type FounderPermissionFailure =
  | 'invalid_permission_contract'
  | 'invalid_founder_issuer'
  | 'missing_human_approval_evidence'
  | 'current_authority_rejected';

export type FounderPermissionValidation =
  | { ok: true; receipt: FounderPermissionReceipt }
  | { ok: false; reason: FounderPermissionFailure | Exclude<AuthorityReceiptV2Validation, { ok: true }>['reason'] };

function canonicalScope(scope: readonly string[]): string[] {
  return [...scope].map((value) => value.trim()).filter(Boolean).sort();
}

function decisionMatchesReceipt(
  decision: FounderPermissionDecisionSnapshot,
  receipt: FounderPermissionReceipt,
): boolean {
  return decision.decision === 'approved'
    && decision.founderId === FOUNDER_PERMISSION_ISSUER_ID
    && decision.subject.repo === receipt.subject.repo
    && decision.subject.headSha.toLowerCase() === receipt.subject.headSha.toLowerCase()
    && decision.subject.baseSha.toLowerCase() === receipt.subject.baseSha.toLowerCase()
    && JSON.stringify(canonicalScope(decision.scope)) === JSON.stringify(canonicalScope(receipt.scope))
    && decision.action.type === receipt.action.type
    && decision.action.target === receipt.action.target
    && decision.action.digest.toLowerCase() === receipt.action.digest.toLowerCase()
    && decision.expiresAt === receipt.expiresAt
    && receipt.evidence.some((item) =>
      item.class === 'human-approval'
      && item.ref === `fcr:founder-decision:${decision.decisionId}`
    );
}

export function validateFounderPermissionReceipt(
  receipt: FounderPermissionReceipt,
  now = new Date(),
): FounderPermissionValidation {
  if (receipt.permissionContract !== FOUNDER_PERMISSION_RECEIPT_CONTRACT) {
    return { ok: false, reason: 'invalid_permission_contract' };
  }

  if (receipt.issuer.type !== 'human' || receipt.issuer.id !== FOUNDER_PERMISSION_ISSUER_ID) {
    return { ok: false, reason: 'invalid_founder_issuer' };
  }

  if (!receipt.evidence.some((item) => item.class === 'human-approval')) {
    return { ok: false, reason: 'missing_human_approval_evidence' };
  }

  const base = validateAuthorityReceiptV2(receipt, now);
  if (!base.ok) return base;

  return { ok: true, receipt };
}

export async function consumeFounderPermissionReceipt(input: {
  receipt: FounderPermissionReceipt;
  currentAuthority: FounderPermissionCurrentAuthority;
  store: AuthorityReceiptV2ConsumptionStore;
  now?: Date;
}): Promise<FounderPermissionValidation> {
  const now = input.now ?? new Date();
  const permission = validateFounderPermissionReceipt(input.receipt, now);
  if (!permission.ok) return permission;

  const decision = await input.currentAuthority.readDecision(input.receipt);
  if (!decision || !decisionMatchesReceipt(decision, input.receipt)) {
    return { ok: false, reason: 'current_authority_rejected' };
  }

  const consumed = await consumeAuthorityReceiptV2({
    receipt: input.receipt,
    currentAuthority: { revalidate: () => true },
    store: input.store,
    now,
  });

  if (!consumed.ok) return consumed;
  return { ok: true, receipt: consumed.receipt as FounderPermissionReceipt };
}
