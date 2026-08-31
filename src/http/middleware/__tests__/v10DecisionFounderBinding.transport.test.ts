import { describe, expect, it, vi } from 'vitest';

const { readFounderSession } = vi.hoisted(() => ({
  readFounderSession: vi.fn(),
}));

vi.mock('../../../auth/founderSession.js', () => ({
  readFounderSession,
}));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: vi.fn() },
}));

import { requireV10DecisionFounderBinding } from '../v10DecisionFounderBinding.js';

describe('V10 merge transport founder-session binding', () => {
  it('rejects bearer-only merge execution when the async opaque-session lookup resolves null', async () => {
    readFounderSession.mockResolvedValueOnce(null);

    const req = {
      body: { actionType: 'merge' },
      params: { missionId: 'mission-v10-merge' },
      founder: { email: 'founder@example.com', userId: 'founder-user' },
      header: vi.fn((name: string) => (
        name.toLowerCase() === 'authorization' ? 'Bearer api-client-token' : undefined
      )),
    };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    await requireV10DecisionFounderBinding(req as never, { status } as never, next);

    expect(readFounderSession).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'FOUNDER_INTERACTIVE_APPROVAL_REQUIRED',
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
