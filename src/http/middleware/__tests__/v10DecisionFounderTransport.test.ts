import { describe, expect, it } from 'vitest';
import { founderMergeTransportErrors } from '../v10DecisionFounderBinding.js';

describe('V10 founder merge transport authority', () => {
  it('rejects bearer-authenticated merge execution so an API client cannot self-approve', () => {
    expect(founderMergeTransportErrors({
      actionType: 'merge',
      authorization: 'Bearer founder-api-session',
    })).toEqual([
      'privileged merge founder approval requires an interactive same-origin founder browser session; bearer-authenticated API clients may request permission but may not self-approve merge execution',
    ]);
  });

  it('preserves bearer-authenticated non-merge execution lanes', () => {
    expect(founderMergeTransportErrors({
      actionType: 'create_branch',
      authorization: 'Bearer founder-api-session',
    })).toEqual([]);
  });

  it('allows the merge decision binder to continue when no bearer credential is present', () => {
    expect(founderMergeTransportErrors({
      actionType: 'merge',
      authorization: null,
    })).toEqual([]);
  });
});
