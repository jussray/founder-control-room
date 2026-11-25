import { afterEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, insert, deleteUser, rpc, signOut } = vi.hoisted(() => {
  const insert = vi.fn();
  const deleteUser = vi.fn();
  const rpc = vi.fn();
  const update = vi.fn();
  const signOut = vi.fn();
  const createClientMock = vi.fn(() => ({
    from: (table: string) => table === 'profiles'
      ? { update: (value: unknown) => { update(value); return { eq: async () => ({ error: null }) }; } }
      : { insert },
    rpc,
    auth: { admin: { signOut, deleteUser } },
  }));
  return { createClientMock, insert, deleteUser, rpc, signOut };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { deleteAccount } from '../delete.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('deleteAccount audit erasure gate', () => {
  it('fails closed and does not enqueue deletion or delete auth after anonymization error', async () => {
    signOut.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: { message: 'database denied anonymization' } });

    await expect(deleteAccount('user-123')).rejects.toThrow(
      'audit anonymization failed: database denied anonymization',
    );
    expect(insert).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('preserves the existing successful path when anonymization succeeds', async () => {
    signOut.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: null });
    insert.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValue({ error: null });

    await expect(deleteAccount('user-123')).resolves.toMatchObject({ success: true });
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-123', status: 'pending' });
    expect(deleteUser).toHaveBeenCalledWith('user-123');
  });
});
