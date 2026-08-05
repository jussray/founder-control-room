import { describe, expect, it } from 'vitest';
import {
  closureReceiptComment,
  isCurrentCloseEvent,
  selectFreshClosureEvidence,
  validateClosureEvidence,
} from '../.github/actions/issue-close-gate/index.mjs';

const complete = `## Closure Evidence
Resolution: Complete.
Scope: docs
Exact head: 0123456789abcdef0123456789abcdef01234567
Proof: Exact-head CI passed.
Rollback: Revert and reopen.
Next gate: none
Unresolved risks: none
Founder approval: @jussray
`;

describe('issue close action discovery contract', () => {
  it('accepts complete founder evidence', () => {
    expect(validateClosureEvidence({
      body: complete,
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    })).toEqual([]);
  });

  it('requires a real commit SHA for documentation scope', () => {
    const failures = validateClosureEvidence({
      body: complete.replace(
        'Exact head: 0123456789abcdef0123456789abcdef01234567',
        'Exact head: not_applicable: documentation only',
      ),
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    });

    expect(failures).toContain(
      '`Exact head:` must be a 40-character SHA for code or documentation scope.',
    );
  });

  it('rejects closure while risk remains', () => {
    const failures = validateClosureEvidence({
      body: complete.replace('Unresolved risks: none', 'Unresolved risks: one blocker remains'),
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    });

    expect(failures).toContain('`Unresolved risks:` must be exactly `none` before closure.');
  });

  it('does not reuse evidence from an earlier close cycle', () => {
    const selected = selectFreshClosureEvidence({
      closedAt: '2026-08-05T08:30:00.000Z',
      reopenedAt: '2026-08-05T08:20:00.000Z',
      founderLogin: 'jussray',
      comments: [
        {
          body: complete,
          created_at: '2026-08-05T08:10:00.000Z',
          updated_at: '2026-08-05T08:10:00.000Z',
          user: { login: 'jussray' },
        },
      ],
    });

    expect(selected).toBeNull();
  });

  it('does not mutate the current issue for a stale close event', () => {
    expect(isCurrentCloseEvent({
      state: 'closed',
      closed_at: '2026-08-05T08:31:00.000Z',
    }, '2026-08-05T08:30:00.000Z')).toBe(false);
  });

  it('produces a visible receipt without copying raw evidence', () => {
    const receipt = closureReceiptComment({
      repository: 'jussray/example',
      issueNumber: 42,
      closedAt: '2026-08-05T08:30:00.000Z',
      evidenceComment: {
        id: 9001,
        body: complete,
        created_at: '2026-08-05T08:25:00.000Z',
        updated_at: '2026-08-05T08:25:00.000Z',
        user: { login: 'jussray' },
      },
    });

    expect(receipt.body).toContain('## Issue closure gate passed');
    expect(receipt.body).toContain('Evidence SHA-256:');
    expect(receipt.body).not.toContain(complete);
  });
});
