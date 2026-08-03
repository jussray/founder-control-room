import { afterEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

import deletionQueueWorker, {
  purgeCloudflareKV,
  runDeletionWorker,
  type DeletionQueueEnv,
} from '../deletion-queue-worker.js';

const env: DeletionQueueEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  CF_ACCOUNT_ID: 'account-id',
  CF_API_TOKEN: 'cloudflare-api-token',
  CF_SESSIONS_KV_NAMESPACE_ID: 'sessions-namespace',
  CF_FEATURE_FLAGS_KV_NAMESPACE_ID: 'flags-namespace',
};

function emptyQueueClient() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: [], error: null });

  return {
    from: vi.fn().mockReturnValue(query),
  };
}

afterEach(() => {
  createClientMock.mockReset();
  vi.unstubAllGlobals();
});

describe('deletion queue Worker runtime bindings', () => {
  it('passes the scheduled event env to the Supabase client', async () => {
    const client = emptyQueueClient();
    createClientMock.mockReturnValue(client);

    await deletionQueueWorker.scheduled({}, env, {});

    expect(createClientMock).toHaveBeenCalledWith(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    expect(client.from).toHaveBeenCalledWith('deletion_queue');
  });

  it('fails closed when a required Supabase binding is missing', async () => {
    await expect(
      runDeletionWorker({
        ...env,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      }),
    ).rejects.toThrow('Missing deletion worker binding: SUPABASE_SERVICE_ROLE_KEY');

    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('URL-encodes KV identifiers and checks every delete response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await purgeCloudflareKV('user/id', env);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/sessions-namespace/values/user%2Fid',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer cloudflare-api-token' },
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not mark KV cleanup as successful when Cloudflare rejects a delete', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(purgeCloudflareKV('user-id', env)).rejects.toThrow(
      'Cloudflare KV purge failed with status 403',
    );
  });
});
