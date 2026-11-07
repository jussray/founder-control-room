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

function canonicalText(value: string): string {
  return value.trim();
}

export function founderMergeActionDigest(input: {
  repo: string;
  pullRequestNumber: number;
  headSha: string;
  baseSha: string;
}): `sha256:${string}` {
  const payload = JSON.stringify({
    action: 'merge',
    repo: canonicalText(input.repo).toLowerCase(),
    pullRequestNumber: input.pullRequestNumber,
    headSha: canonicalText(input.headSha).toLowerCase(),
    baseSha: canonicalText(input.baseSha).toLowerCase(),
  });
  return `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

export function issueFounderMergePermissionReceipt(
  source: FounderMergePermissionSource,
  checkedAt = new Date().toISOString(),
): FounderPermissionReceipt {
  const permissionId = canonicalText(source.permissionId);
  const decisionId = canonicalText(source.decisionId);
  const repo = canonicalText(source.repo).toLowerCase();
  const headSha = canonicalText(source.headSha).toLowerCase();
  const baseSha = canonicalText(source.baseSha).toLowerCase();

  if (!permissionId) throw new Error('permission id is required');
  if (!decisionId) throw new Error('founder decision id is required');
  if (!OWNED_REPO.test(repo)) throw new Error('owned repository identity is required');
  if (!Number.isInteger(source.pullRequestNumber) || source.pullRequestNumber <= 0) {
    throw new Error('pull request number must be a positive integer');
  }
  if (!FULL_SHA.test(headSha) || !FULL_SHA.test(baseSha)) {
    throw new Error('exact head and base SHAs are required');
  }

  const approvedAtMs = Date.parse(source.approvedAt);
  const expiresAtMs = Date.parse(source.expiresAt);
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(approvedAtMs) || !Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs)) {
    throw new Error('permission timestamps must be valid');
  }
  if (expiresAtMs <= approvedAtMs) throw new Error('permission expiry must follow approval time');
  if (checkedAtMs < approvedAtMs || checkedAtMs >= expiresAtMs) {
    throw new Error('permission check time must be within the approval window');
  }

  const actionTarget = `${repo}#${source.pullRequestNumber}`;
  const receipt: AuthorityReceiptV2 & FounderPermissionReceipt = {
    contract: AUTHORITY_RECEIPT_V2_CONTRACT,
    permissionContract: FOUNDER_PERMISSION_RECEIPT_CONTRACT,
    id: permissionId,
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
      { ref: `fcr:founder-decision:${decisionId}`, class: 'human-approval' },
      { ref: `github:commit:${headSha}`, class: 'repository' },
      { ref: `github:pull-request:${repo}#${source.pullRequestNumber}`, class: 'provider' },
    ],
    issuedAt: new Date(approvedAtMs).toISOString(),
    checkedAt: new Date(checkedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    status: 'active',
  };

  return Object.freeze(receipt);
}
