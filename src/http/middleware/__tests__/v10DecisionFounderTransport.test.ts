import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: vi.fn() },
}));

import { founderMergeTransportErrors } from '../v10DecisionFounderBinding.js';

describe('V10 founder merge transport authority', () => {
  it('rejects bearer-only merge execution so an API client cannot self-approve', () => {
    expect(founderMergeTransportErrors({
      actionType: 'merge',
      authorization: 'Bearer founder-api-session',
      hasFounderCookieSession: false,
    })).toEqual([
      'privileged merge founder approval requires a same-origin founder browser session or a future registered adapter attestation; bearer-only API clients may request permission but may not self-approve merge execution',
    ]);
  });

  it('preserves the real browser merge path when bearer and HttpOnly founder session are both present', () => {
    expect(founderMergeTransportErrors({
      actionType: 'merge',
      authorization: 'Bearer browser-api-session',
      hasFounderCookieSession: true,
    })).toEqual([]);
  });

  it('preserves bearer-authenticated non-merge execution lanes', () => {
    expect(founderMergeTransportErrors({
      actionType: 'create_branch',
      authorization: 'Bearer founder-api-session',
      hasFounderCookieSession: false,
    })).toEqual([]);
  });

  it('allows the merge decision binder to continue when no bearer credential is present', () => {
    expect(founderMergeTransportErrors({
      actionType: 'merge',
      authorization: null,
      hasFounderCookieSession: true,
    })).toEqual([]);
  });
});
