import {
  validateFounderPermissionReceipt,
  type FounderPermissionReceipt,
} from './founderPermissionReceipt.js';
import { founderMergeActionDigest } from './founderPermissionReceiptIssuer.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;

export type FounderMergeExecutionTarget = Readonly<{
  repo: string;
  pullRequestNumber: number;
  headSha: string;
  baseSha: string;
}>;

export type FounderPermissionExecutionBinding = Readonly<{
  receiptId: string;
  founderDecisionRef: string;
  repositoryEvidenceRef: string;
  providerEvidenceRef: string;
  repo: string;
  pullRequestNumber: number;
  headSha: string;
  baseSha: string;
  actionType: 'merge';
  actionTarget: string;
  actionDigest: `sha256:${string}`;
}>;

export type FounderPermissionExecutionBindingFailure =
  | 'invalid_execution_target'
  | 'invalid_founder_permission_receipt'
  | 'merge_action_required'
  | 'subject_mismatch'
  | 'scope_mismatch'
  | 'action_target_mismatch'
  | 'action_digest_mismatch'
  | 'evidence_set_mismatch';

export type FounderPermissionExecutionBindingResult =
  | { ok: true; binding: FounderPermissionExecutionBinding }
  | {
      ok: false;
      reason: FounderPermissionExecutionBindingFailure;
      detail?: string;
    };

function canonicalTarget(target: FounderMergeExecutionTarget): FounderMergeExecutionTarget | null {
  const repo = target.repo.trim().toLowerCase();
  const headSha = target.headSha.trim().toLowerCase();
  const baseSha = target.baseSha.trim().toLowerCase();
  if (!OWNED_REPO.test(repo)) return null;
  if (!Number.isInteger(target.pullRequestNumber) || target.pullRequestNumber <= 0) return null;
  if (!FULL_SHA.test(headSha) || !FULL_SHA.test(baseSha)) return null;
  return Object.freeze({
    repo,
    pullRequestNumber: target.pullRequestNumber,
    headSha,
    baseSha,
  });
}

export function bindFounderPermissionToMergeExecution(
  receipt: FounderPermissionReceipt,
  target: FounderMergeExecutionTarget,
  now = new Date(),
): FounderPermissionExecutionBindingResult {
  const expected = canonicalTarget(target);
  if (!expected) return { ok: false, reason: 'invalid_execution_target' };

  const validated = validateFounderPermissionReceipt(receipt, now);
  if (!validated.ok) {
    return {
      ok: false,
      reason: 'invalid_founder_permission_receipt',
      detail: validated.reason,
    };
  }

  if (receipt.action.type !== 'merge') {
    return { ok: false, reason: 'merge_action_required' };
  }

  if (
    receipt.subject.repo.toLowerCase() !== expected.repo
    || receipt.subject.headSha.toLowerCase() !== expected.headSha
    || receipt.subject.baseSha.toLowerCase() !== expected.baseSha
  ) {
    return { ok: false, reason: 'subject_mismatch' };
  }

  const expectedScope = `merge:${expected.repo}`;
  if (receipt.scope.length !== 1 || receipt.scope[0]?.toLowerCase() !== expectedScope) {
    return { ok: false, reason: 'scope_mismatch' };
  }

  const expectedActionTarget = `${expected.repo}#${expected.pullRequestNumber}`;
  if (receipt.action.target.toLowerCase() !== expectedActionTarget) {
    return { ok: false, reason: 'action_target_mismatch' };
  }

  const expectedDigest = founderMergeActionDigest(expected);
  if (receipt.action.digest.toLowerCase() !== expectedDigest) {
    return { ok: false, reason: 'action_digest_mismatch' };
  }

  const expectedDecisionPrefix = 'fcr:founder-decision:';
  const expectedRepositoryEvidence = `github:commit:${expected.headSha}`;
  const expectedProviderEvidence = `github:pull-request:${expected.repo}#${expected.pullRequestNumber}`;
  const humanEvidence = receipt.evidence.filter((item) => item.class === 'human-approval');
  const repositoryEvidence = receipt.evidence.filter((item) => item.class === 'repository');
  const providerEvidence = receipt.evidence.filter((item) => item.class === 'provider');

  if (
    receipt.evidence.length !== 3
    || humanEvidence.length !== 1
    || repositoryEvidence.length !== 1
    || providerEvidence.length !== 1
    || !humanEvidence[0]!.ref.startsWith(expectedDecisionPrefix)
    || humanEvidence[0]!.ref.length <= expectedDecisionPrefix.length
    || repositoryEvidence[0]!.ref.toLowerCase() !== expectedRepositoryEvidence
    || providerEvidence[0]!.ref.toLowerCase() !== expectedProviderEvidence
  ) {
    return { ok: false, reason: 'evidence_set_mismatch' };
  }

  return {
    ok: true,
    binding: Object.freeze({
      receiptId: receipt.id,
      founderDecisionRef: humanEvidence[0]!.ref,
      repositoryEvidenceRef: repositoryEvidence[0]!.ref,
      providerEvidenceRef: providerEvidence[0]!.ref,
      repo: expected.repo,
      pullRequestNumber: expected.pullRequestNumber,
      headSha: expected.headSha,
      baseSha: expected.baseSha,
      actionType: 'merge',
      actionTarget: expectedActionTarget,
      actionDigest: expectedDigest,
    }),
  };
}
