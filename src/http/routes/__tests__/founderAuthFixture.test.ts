import { describe, expect, it } from 'vitest';
import { boundFounderRow } from './founderAuthFixture.js';
describe('bound founder allowlist fixture', () => {
  it('allows only simultaneous matching email and immutable identity', async () => {
    const valid = await boundFounderRow('founder@example.com', 'bound-id').select()
      .eq('email', 'founder@example.com').eq('user_id', 'bound-id').maybeSingle();
    expect(valid.data?.user_id).toBe('bound-id');
    const wrongId = await boundFounderRow('founder@example.com', 'bound-id').select()
      .eq('email', 'founder@example.com').eq('user_id', 'other-id').maybeSingle();
    expect(wrongId.data).toBeNull();
    const emailOnly = await boundFounderRow('founder@example.com', 'bound-id').select()
      .eq('email', 'founder@example.com').maybeSingle();
    expect(emailOnly.data).toBeNull();
  });
});
