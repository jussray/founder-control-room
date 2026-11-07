import { describe, expect, it } from 'vitest';

import { validateFounderPermissionReceipt } from '../founderPermissionReceipt.js';
import {
  founderMergeActionDigest,
  issueFounderMergePermissionReceipt,
} from '../founderPermissionReceiptIssuer.js';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

function source() {
  return {
    permissionId: 'permission-1',
    decisionId: 'decision-1',
    repo: 'jussray/founder-control-room',
    pullRequestNumber: 999,
    headSha: HEAD,
    baseSha: BASE,
    approvedAt: '2026-08-26T23:00:00.000Z',
    expiresAt: '2026-08-26T23:15:00.000Z',
  };
}

describe('FounderPermissionReceipt issuer', () => {
  it('derives a merge permission receipt from exact decision identity', () => {
    const receipt = issueFounderMergePermissionReceipt(source(), '2026-08-26T23:01:00.000Z');

    expect(receipt.issuer).toEqual({ type: 'human', id: 'founder' });
    expect(receipt.subject).toEqual({
      repo: 'jussray/founder-control-room',
      headSha: HEAD,
      baseSha: BASE,
    });
    expect(receipt.scope).toEqual(['merge:jussray/founder-control-room']);
    expect(receipt.action.type).toBe('merge');
    expect(receipt.action.target).toBe('jussray/founder-control-room#999');
    expect(receipt.action.digest).toBe(founderMergeActionDigest(source()));
    expect(receipt.evidence).toEqual([
      { ref: 'fcr:founder-decision:decision-1', class: 'human-approval' },
      { ref: `github:commit:${HEAD}`, class: 'repository' },
      { ref: 'github:pull-request:jussray/founder-control-room#999', class: 'provider' },
    ]);
    expect(validateFounderPermissionReceipt(receipt, new Date('2026-08-26T23:02:00.000Z')).ok).toBe(true);
  });

  it('changes the digest when exact merge identity changes', () => {
    const first = issueFounderMergePermissionReceipt(source(), '2026-08-26T23:01:00.000Z');
    const second = issueFounderMergePermissionReceipt({
      ...source(),
      headSha: 'c'.repeat(40),
    }, '2026-08-26T23:01:00.000Z');

    expect(first.action.digest).not.toBe(second.action.digest);
  });

  it('canonicalizes caller representation without changing authority identity', () => {
    const receipt = issueFounderMergePermissionReceipt({
      ...source(),
      permissionId: ' permission-1 ',
      decisionId: ' decision-1 ',
      repo: ' JUSSRAY/FOUNDER-CONTROL-ROOM ',
      headSha: ` ${HEAD.toUpperCase()} `,
      baseSha: ` ${BASE.toUpperCase()} `,
      approvedAt: '2026-08-26T19:00:00-04:00',
      expiresAt: '2026-08-26T19:15:00-04:00',
    }, '2026-08-26T19:01:00-04:00');

    expect(receipt.id).toBe('permission-1');
    expect(receipt.subject).toEqual({
      repo: 'jussray/founder-control-room',
      headSha: HEAD,
      baseSha: BASE,
    });
    expect(receipt.issuedAt).toBe('2026-08-26T23:00:00.000Z');
    expect(receipt.checkedAt).toBe('2026-08-26T23:01:00.000Z');
    expect(receipt.expiresAt).toBe('2026-08-26T23:15:00.000Z');
    expect(receipt.action.digest).toBe(founderMergeActionDigest(source()));
  });

  it('rejects identities outside the owned exact merge boundary', () => {
    expect(() => issueFounderMergePermissionReceipt({ ...source(), repo: 'other/repo' }))
      .toThrow('owned repository identity is required');
    expect(() => issueFounderMergePermissionReceipt({ ...source(), headSha: 'not-a-sha' }))
      .toThrow('exact head and base SHAs are required');
    expect(() => issueFounderMergePermissionReceipt({ ...source(), pullRequestNumber: 0 }))
      .toThrow('pull request number must be a positive integer');
  });

  it('rejects malformed, inverted, early, or expired check times', () => {
    expect(() => issueFounderMergePermissionReceipt({ ...source(), approvedAt: 'nope' }))
      .toThrow('permission timestamps must be valid');
    expect(() => issueFounderMergePermissionReceipt({
      ...source(),
      expiresAt: '2026-08-26T22:59:59.000Z',
    }))
      .toThrow('permission expiry must follow approval time');
    expect(() => issueFounderMergePermissionReceipt(source(), '2026-08-26T22:59:59.000Z'))
      .toThrow('permission check time must be within the approval window');
    expect(() => issueFounderMergePermissionReceipt(source(), '2026-08-26T23:15:00.000Z'))
      .toThrow('permission check time must be within the approval window');
  });
});
