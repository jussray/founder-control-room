import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: { from, rpc },
}));

import { setFounderDesiredState } from '../store.js';

function overrideRead(data = null) {
  from.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data, error: null }) }),
    }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('switchboard store', () => {
  it('refuses to turn a locked-off capability on before any database write', async () => {
    await expect(setFounderDesiredState({
      switchId: 'sekret-store-release',
      desiredState: 'on',
      actorEmail: 'founder@example.com',
    })).rejects.toMatchObject({ code: 'locked_off' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('writes a changed state through the atomic RPC with the observed previous state', async () => {
    overrideRead(null);
    rpc.mockResolvedValue({
      data: [{
        switch_id: 'fcr-privileged-execution-master',
        desired_state: 'off',
        reason: 'Pause execution.',
        updated_by: 'founder@example.com',
        updated_at: '2026-08-15T06:00:00.000Z',
      }],
      error: null,
    });

    const result = await setFounderDesiredState({
      switchId: 'fcr-privileged-execution-master',
      desiredState: 'off',
      actorEmail: 'founder@example.com',
      reason: 'Pause execution.',
    });

    expect(rpc).toHaveBeenCalledWith('set_founder_switch_state', {
      p_switch_id: 'fcr-privileged-execution-master',
      p_previous_state: 'on',
      p_desired_state: 'off',
      p_reason: 'Pause execution.',
      p_actor_email: 'founder@example.com',
    });
    expect(result).toMatchObject({ desiredState: 'off', override: true });
  });

  it('surfaces atomic write failures instead of claiming success', async () => {
    overrideRead(null);
    rpc.mockResolvedValue({ data: null, error: { message: 'stale switch state' } });

    await expect(setFounderDesiredState({
      switchId: 'fcr-privileged-execution-master',
      desiredState: 'off',
      actorEmail: 'founder@example.com',
    })).rejects.toEqual(expect.objectContaining({ code: 'write_failed' }));
  });
});
