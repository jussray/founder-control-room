import { describe, expect, it } from 'vitest';
import { validateClosureEvidence } from '../.github/actions/issue-close-gate/index.mjs';

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

  it('rejects closure while risk remains', () => {
    const failures = validateClosureEvidence({
      body: complete.replace('Unresolved risks: none', 'Unresolved risks: one blocker remains'),
      authorLogin: 'jussray',
      authorAssociation: 'OWNER',
      founderLogin: 'jussray',
    });

    expect(failures).toContain('`Unresolved risks:` must be exactly `none` before closure.');
  });
});
