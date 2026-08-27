import { createHash } from 'node:crypto';

import {
  AUTHORITY_RECEIPT_V2_CONTRACT,
  type AuthorityReceiptV2,
} from './authorityReceiptV2.js';
import {
  FOUNDER_PERMISSION_ISSUER_ID,
  FOUNDER_PERMISSION_RECEIPT_CONTRACT,
  type FounderPermissionReceipt,
} from './founderPermissionReceipt.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;

export interface FounderMergePermissionSource {
  permissionId: string;
  decisionId: string;
  repo: string;
  pullRequestNumber: number;
  headSha: string;
  baseSha: string;
  approvedAt: string;
  expiresAt: string;
}

export function founderMergeActionDigest(input: {
  repo: string;
  pullRequestNumber: number;
  headSha: string;
  baseSha: string;
}): `sha256:${string}` {
  const payload = JSON.stringify({
    action: 'merge',
    repo: input.repo.toLowerCase(),
    pullRequestNumber: input.pullRequestNumber,
    headSha: input.headSha.toLowerCase(),
    baseSha: input.baseSha.toLowerCase(),
  });
  return `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

export function issueFounderMergePermissionReceipt(
  source: FounderMergePermissionSource,
  checkedAt = new Date().toISOString(),
): FounderPermissionReceipt {
  if (!source.permissionId.trim()) throw new Error('permission id is required');
  if (!source.decisionId.trim()) throw new Error('founder decision id is required');
  if (!OWNED_REPO.test(source.repo)) throw new Error('owned repository identity is required');
  if (!Number.isInteger(source.pullRequestNumber) || source.pullRequestNumber <= 0) {
    throw new Error('pull request number must be a positive integer');
  }
  if (!FULL_SHA.test(source.headSha) || !FULL_SHA.test(source.baseSha)) {
    throw new Error('exact head and base SHAs are required');
  }

  const approvedAtMs = Date.parse(source.approvedAt);
  const expiresAtMs = Date.parse(source.expiresAt);
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(approvedAtMs) || !Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs)) {
    throw new Error('permission timestamps must be valid');
  }
  if (expiresAtMs <= approvedAtMs) throw new Error('permission expiry must follow approval time');

  const repo = source.repo.toLowerCase();
  const headSha = source.headSha.toLowerCase();
  const baseSha = source.baseSha.toLowerCase();
  const actionTarget = `${repo}#${source.pullRequestNumber}`;
  const receipt: AuthorityReceiptV2 & FounderPermissionReceipt = {
    contract: AUTHORITY_RECEIPT_V2_CONTRACT,
    permissionContract: FOUNDER_PERMISSION_RECEIPT_CONTRACT,
    id: source.permissionId,
    subject: {
      repo,
      headSha,
      baseSha,
    },
    issuer: { type: 'human', id: FOUNDER_PERMISSION_ISSUER_ID },
    scope: [`merge:${repo}`],
    action: {
      type: 'merge',
      target: actionTarget,
      digest: founderMergeActionDigest({
        repo,
        pullRequestNumber: source.pullRequestNumber,
        headSha,
        baseSha,
      }),
    },
    evidence: [
      { ref: `fcr:founder-decision:${source.decisionId}`, class: 'human-approval' },
      { ref: `github:commit:${headSha}`, class: 'repository' },
      { ref: `github:pull-request:${repo}#${source.pullRequestNumber}`, class: 'provider' },
    ],
    issuedAt: source.approvedAt,
    checkedAt,
    expiresAt: source.expiresAt,
    status: 'active',
  };

  return Object.freeze(receipt);
}
