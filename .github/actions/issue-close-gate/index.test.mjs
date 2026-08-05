import { describe, expect, it } from 'vitest';
import {
  closureReceiptComment,
  isCurrentCloseEvent,
  isExpectedRepositoryHead,
  isIntegratedCompareStatus,
  latestReopenedAt,
  parseClosureEvidence,
  selectFreshClosureEvidence,
  validateClosureEvidence,
} from './index.mjs';

const EXACT_HEAD = '0123456789abcdef0123456789abcdef01234567';
const VALID_BODY = `## Closure Evidence
Resolution: The tracked defect is fixed and the issue scope is complete.
Scope: code
Exact head: ${EXACT_HEAD}
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
      exactHead: EXACT_HEAD,
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
        `Exact head: ${EXACT_HEAD}`,
        'Exact head: not_applicable: vendor account activation has no repository mutation',
      );

    expect(validateClosureEvidence({
      body,
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    })).toEqual([]);
  });

  it('rejects not_applicable exact-head evidence for code and documentation scope', () => {
    for (const scope of ['code', 'docs']) {
      const body = VALID_BODY
        .replace('Scope: code', `Scope: ${scope}`)
        .replace(
          `Exact head: ${EXACT_HEAD}`,
          'Exact head: not_applicable: no repository mutation',
        );
      const failures = validateClosureEvidence({
        body,
        authorLogin: 'jussray',
        authorAssociation: 'OWNER',
        founderLogin: 'jussray',
      });

      expect(failures).toContain(
        '`Exact head:` must be a 40-character SHA for code or documentation scope.',
      );
    }
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

  it('ignores a later evidence-shaped comment from a non-founder', () => {
    const selected = selectFreshClosureEvidence({
      closedAt: '2026-08-05T08:30:00.000Z',
      reopenedAt: null,
      founderLogin: 'jussray',
      comments: [
        {
          id: 1,
          body: VALID_BODY,
          created_at: '2026-08-05T08:20:00.000Z',
          updated_at: '2026-08-05T08:20:00.000Z',
          user: { login: 'jussray' },
        },
        {
          id: 2,
          body: VALID_BODY.replace('Proof: CI, focused regression tests, and Playwright passed on the exact head.', 'Proof: none'),
          created_at: '2026-08-05T08:25:00.000Z',
          updated_at: '2026-08-05T08:25:00.000Z',
          user: { login: 'someone-else' },
        },
      ],
    });

    expect(selected?.id).toBe(1);
  });

  it('blocks missing proof and malformed exact-head evidence', () => {
    const body = VALID_BODY
      .replace('Proof: CI, focused regression tests, and Playwright passed on the exact head.\n', '')
      .replace(`Exact head: ${EXACT_HEAD}`, 'Exact head: main');
    const failures = validateClosureEvidence({
      body,
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    });

    expect(failures).toContain('`Proof:` is required and may not be `none`.');
    expect(failures).toContain(
      '`Exact head:` must be a 40-character SHA for code or documentation scope.',
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
      founderLogin: 'jussray',
      comments: [
        {
          body: VALID_BODY,
          created_at: '2026-08-05T08:10:00.000Z',
          updated_at: '2026-08-05T08:10:00.000Z',
          user: { login: 'jussray' },
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
      founderLogin: 'jussray',
      comments: [
        {
          body: VALID_BODY,
          created_at: '2026-08-05T08:25:00.000Z',
          updated_at: '2026-08-05T08:31:00.000Z',
          user: { login: 'jussray' },
        },
      ],
    });

    expect(selected).toBeNull();
  });

  it('treats reruns for an older close timestamp as stale', () => {
    expect(isCurrentCloseEvent({
      state: 'closed',
      closed_at: '2026-08-05T08:35:00.000Z',
    }, '2026-08-05T08:30:00.000Z')).toBe(false);
    expect(isCurrentCloseEvent({
      state: 'closed',
      closed_at: '2026-08-05T08:30:00.000Z',
    }, '2026-08-05T08:30:00.000Z')).toBe(true);
  });

  it('binds repository evidence to the default-branch head captured by the close event', () => {
    expect(isExpectedRepositoryHead(EXACT_HEAD, EXACT_HEAD)).toBe(true);
    expect(isExpectedRepositoryHead(EXACT_HEAD.toUpperCase(), EXACT_HEAD)).toBe(true);
    expect(isExpectedRepositoryHead(EXACT_HEAD, 'f'.repeat(40))).toBe(false);
    expect(isExpectedRepositoryHead('main', EXACT_HEAD)).toBe(false);
  });

  it('allows the captured head to remain current or become an ancestor after the close event', () => {
    expect(isIntegratedCompareStatus('ahead')).toBe(true);
    expect(isIntegratedCompareStatus('identical')).toBe(true);
    expect(isIntegratedCompareStatus('behind')).toBe(false);
    expect(isIntegratedCompareStatus('diverged')).toBe(false);
  });

  it('creates a source-bound visible closure receipt', () => {
    const receipt = closureReceiptComment({
      repository: 'jussray/example',
      issueNumber: 42,
      closedAt: '2026-08-05T08:30:00.000Z',
      repositoryHead: EXACT_HEAD,
      evidenceComment: {
        id: 9001,
        body: VALID_BODY,
        created_at: '2026-08-05T08:25:00.000Z',
        updated_at: '2026-08-05T08:25:00.000Z',
        user: { login: 'jussray' },
      },
    });

    expect(receipt.marker).toBe(
      '<!-- issue-close-gate:passed:9001:2026-08-05T08:30:00.000Z -->',
    );
    expect(receipt.body).toContain('## Issue closure gate passed');
    expect(receipt.body).toContain(`Repository head at close: \`${EXACT_HEAD}\``);
    expect(receipt.body).toContain('Evidence SHA-256:');
    expect(receipt.body).not.toContain(VALID_BODY);
  });
});
