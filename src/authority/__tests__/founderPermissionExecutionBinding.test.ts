import { describe, expect, it } from 'vitest';

import { issueFounderMergePermissionReceipt } from '../founderPermissionReceiptIssuer.js';
import { bindFounderPermissionToMergeExecution } from '../founderPermissionExecutionBinding.js';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const REPO = 'jussray/founder-control-room';
const PR = 696;

function target() {
  return {
    repo: REPO,
    pullRequestNumber: PR,
    headSha: HEAD,
    baseSha: BASE,
  };
}

function receipt() {
  return issueFounderMergePermissionReceipt({
    permissionId: 'founder-permission:proof-1',
    decisionId: 'proof-1',
    repo: REPO,
    pullRequestNumber: PR,
    headSha: HEAD,
    baseSha: BASE,
    approvedAt: '2026-08-26T23:00:00.000Z',
    expiresAt: '2026-08-26T23:15:00.000Z',
  }, '2026-08-26T23:01:00.000Z');
}

const NOW = new Date('2026-08-26T23:02:00.000Z');

describe('founder permission execution binding', () => {
  it('binds one founder decision to exactly one merge candidate', () => {
    const result = bindFounderPermissionToMergeExecution(receipt(), target(), NOW);
    expect(result).toEqual({
      ok: true,
      binding: expect.objectContaining({
        receiptId: 'founder-permission:proof-1',
        founderDecisionRef: 'fcr:founder-decision:proof-1',
        repo: REPO,
        pullRequestNumber: PR,
        headSha: HEAD,
        baseSha: BASE,
        actionType: 'merge',
        actionTarget: `${REPO}#${PR}`,
      }),
    });
  });

  it('expires authority instead of carrying approval forward', () => {
    const result = bindFounderPermissionToMergeExecution(
      receipt(),
      target(),
      new Date('2026-08-26T23:15:01.000Z'),
    );
    expect(result).toEqual({
      ok: false,
      reason: 'invalid_founder_permission_receipt',
      detail: 'expired',
    });
  });

  it('rejects head, base, or pull-request movement', () => {
    expect(bindFounderPermissionToMergeExecution(receipt(), {
      ...target(),
      headSha: 'c'.repeat(40),
    }, NOW)).toMatchObject({ ok: false, reason: 'subject_mismatch' });

    expect(bindFounderPermissionToMergeExecution(receipt(), {
      ...target(),
      baseSha: 'd'.repeat(40),
    }, NOW)).toMatchObject({ ok: false, reason: 'subject_mismatch' });

    expect(bindFounderPermissionToMergeExecution(receipt(), {
      ...target(),
      pullRequestNumber: PR + 1,
    }, NOW)).toMatchObject({ ok: false, reason: 'action_target_mismatch' });
  });

  it('rejects scope widening even when the exact merge scope is still present', () => {
    const widened = {
      ...receipt(),
      scope: [`merge:${REPO}`, 'deploy:jussray/founder-control-room'],
    };
    expect(bindFounderPermissionToMergeExecution(widened, target(), NOW))
      .toMatchObject({ ok: false, reason: 'scope_mismatch' });
  });

  it('rejects action digest mutation and missing founder-decision provenance', () => {
    const changedDigest = {
      ...receipt(),
      action: {
        ...receipt().action,
        digest: `sha256:${'0'.repeat(64)}` as `sha256:${string}`,
      },
    };
    expect(bindFounderPermissionToMergeExecution(changedDigest, target(), NOW))
      .toMatchObject({ ok: false, reason: 'action_digest_mismatch' });

    const missingDecision = {
      ...receipt(),
      evidence: receipt().evidence.map((item) =>
        item.class === 'human-approval'
          ? { ...item, ref: 'human:approval:unbound' }
          : item),
    };
    expect(bindFounderPermissionToMergeExecution(missingDecision, target(), NOW))
      .toMatchObject({ ok: false, reason: 'founder_decision_evidence_missing' });
  });

  it('rejects malformed execution targets before reading them as authority', () => {
    expect(bindFounderPermissionToMergeExecution(receipt(), {
      ...target(),
      repo: 'other/repo',
    }, NOW)).toMatchObject({ ok: false, reason: 'invalid_execution_target' });

    expect(bindFounderPermissionToMergeExecution(receipt(), {
      ...target(),
      headSha: 'short',
    }, NOW)).toMatchObject({ ok: false, reason: 'invalid_execution_target' });
  });
});
