import { describe, expect, it } from 'vitest';
import {
  latestReopenedAt,
  parseClosureEvidence,
  selectFreshClosureEvidence,
  validateClosureEvidence,
} from './index.mjs';

const VALID_BODY = `## Closure Evidence
Resolution: The tracked defect is fixed and the issue scope is complete.
Scope: code
Exact head: 0123456789abcdef0123456789abcdef01234567
Proof: CI, focused regression tests, and Playwright passed on the exact head.
Rollback: Revert the merge commit and reopen this issue.
Next gate: none
Unresolved risks: none
Founder approval: @jussray
`;

describe('issue close gate evidence', () => {
  it('parses the canonical closure evidence block', () => {
    expect(parseClosureEvidence(VALID_BODY)).toEqual({
      resolution: 'The tracked defect is fixed and the issue scope is complete.',
      scope: 'code',
      exactHead: '0123456789abcdef0123456789abcdef01234567',
      proof: 'CI, focused regression tests, and Playwright passed on the exact head.',
      rollback: 'Revert the merge commit and reopen this issue.',
      nextGate: 'none',
      unresolvedRisks: 'none',
      founderApproval: '@jussray',
    });
  });

  it('accepts founder-authored evidence with exact-head proof', () => {
    expect(validateClosureEvidence({
      body: VALID_BODY,
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    })).toEqual([]);
  });

  it('accepts a reasoned non-code exact-head exception', () => {
    const body = VALID_BODY
      .replace('Scope: code', 'Scope: operations')
      .replace(
        'Exact head: 0123456789abcdef0123456789abcdef01234567',
        'Exact head: not_applicable: vendor account activation has no repository mutation',
      );

    expect(validateClosureEvidence({
      body,
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    })).toEqual([]);
  });

  it('blocks unresolved risk even with founder approval', () => {
    const failures = validateClosureEvidence({
      body: VALID_BODY.replace('Unresolved risks: none', 'Unresolved risks: production proof missing'),
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    });

    expect(failures).toContain('`Unresolved risks:` must be exactly `none` before closure.');
  });

  it('blocks closure evidence posted by another author', () => {
    const failures = validateClosureEvidence({
      body: VALID_BODY,
      authorLogin: 'someone-else',
      authorAssociation: 'COLLABORATOR',
      founderLogin: 'jussray',
    });

    expect(failures).toContain('Closure evidence must be posted by @jussray.');
  });

  it('blocks missing proof and malformed exact-head evidence', () => {
    const body = VALID_BODY
      .replace('Proof: CI, focused regression tests, and Playwright passed on the exact head.\n', '')
      .replace('Exact head: 0123456789abcdef0123456789abcdef01234567', 'Exact head: main');
    const failures = validateClosureEvidence({
      body,
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    });

    expect(failures).toContain('`Proof:` is required and may not be `none`.');
    expect(failures).toContain(
      '`Exact head:` must be a 40-character SHA or `not_applicable: <reason>`.',
    );
  });

  it('rejects evidence from before the latest reopen', () => {
    const closedAt = '2026-08-05T08:30:00.000Z';
    const reopenedAt = latestReopenedAt([
      { event: 'reopened', created_at: '2026-08-05T08:20:00.000Z' },
    ], closedAt);
    const selected = selectFreshClosureEvidence({
      closedAt,
      reopenedAt,
      comments: [
        {
          body: VALID_BODY,
          created_at: '2026-08-05T08:10:00.000Z',
          updated_at: '2026-08-05T08:10:00.000Z',
        },
      ],
    });

    expect(reopenedAt).toBe('2026-08-05T08:20:00.000Z');
    expect(selected).toBeNull();
  });

  it('rejects evidence edited after the close event', () => {
    const selected = selectFreshClosureEvidence({
      closedAt: '2026-08-05T08:30:00.000Z',
      reopenedAt: null,
      comments: [
        {
          body: VALID_BODY,
          created_at: '2026-08-05T08:25:00.000Z',
          updated_at: '2026-08-05T08:31:00.000Z',
        },
      ],
    });

    expect(selected).toBeNull();
  });
});
