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

const envWithoutKv: DeletionQueueEnv = {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
};

interface QueueClientOptions {
  readData?: unknown[];
  readError?: unknown;
  updateErrors?: unknown[];
  rpcError?: unknown;
}

function queueClient(options: QueueClientOptions = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const updateErrors = [...(options.updateErrors ?? [])];

  const from = vi.fn(() => ({
    select: vi.fn(() => {
      const query = {
        eq: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
      };
      query.eq.mockReturnValue(query);
      query.order.mockReturnValue(query);
      query.limit.mockResolvedValue({
        data: options.readData ?? [],
        error: options.readError ?? null,
      });
      return query;
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      return {
        eq: vi.fn().mockResolvedValue({
          error: updateErrors.shift() ?? null,
        }),
      };
    }),
  }));

  return {
    client: {
      from,
      rpc: vi.fn().mockResolvedValue({ error: options.rpcError ?? null }),
    },
    from,
    updates,
  };
}

afterEach(() => {
  createClientMock.mockReset();
  vi.unstubAllGlobals();
});

describe('deletion queue Worker runtime bindings', () => {
  it('passes the scheduled event env to the Supabase client', async () => {
    const { client, from } = queueClient();
    createClientMock.mockReturnValue(client);

    await deletionQueueWorker.scheduled({}, env, {});

    expect(createClientMock).toHaveBeenCalledWith(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    expect(from).toHaveBeenCalledWith('deletion_queue');
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

  it('surfaces queue-read errors before processing entries', async () => {
    const { client } = queueClient({ readError: new Error('queue read failed') });
    createClientMock.mockReturnValue(client);

    await expect(runDeletionWorker(envWithoutKv)).rejects.toThrow('queue read failed');
  });

  it('rejects malformed queue rows instead of issuing broad mutations', async () => {
    const { client, updates } = queueClient({
      readData: [{ id: 'entry-without-user' }],
    });
    createClientMock.mockReturnValue(client);

    await expect(runDeletionWorker(envWithoutKv)).rejects.toThrow(
      'Deletion queue returned an invalid entry',
    );
    expect(updates).toEqual([]);
  });

  it('records an entry failure and rejects the cron run', async () => {
    const { client, updates } = queueClient({
      readData: [{ id: 'entry-1', user_id: 'user-1' }],
      rpcError: new Error('audit anonymization failed'),
    });
    createClientMock.mockReturnValue(client);

    await expect(runDeletionWorker(envWithoutKv)).rejects.toThrow(
      'Deletion queue failed 1 of 1 entries',
    );
    expect(updates).toEqual([
      { status: 'processing' },
      { status: 'failed', error: 'audit anonymization failed' },
    ]);
  });

  it('never reports success when the completion write fails', async () => {
    const { client, updates } = queueClient({
      readData: [{ id: 'entry-2', user_id: 'user-2' }],
      updateErrors: [null, new Error('completion write failed'), null],
    });
    createClientMock.mockReturnValue(client);

    await expect(runDeletionWorker(envWithoutKv)).rejects.toThrow(
      'Deletion queue failed 1 of 1 entries',
    );
    expect(updates[0]).toEqual({ status: 'processing' });
    expect(updates[1]).toMatchObject({ status: 'done' });
    expect(updates[2]).toEqual({ status: 'failed', error: 'completion write failed' });
  });

  it('surfaces failure-state persistence errors', async () => {
    const { client } = queueClient({
      readData: [{ id: 'entry-3', user_id: 'user-3' }],
      updateErrors: [null, new Error('failed-state write failed')],
      rpcError: new Error('audit anonymization failed'),
    });
    createClientMock.mockReturnValue(client);

    await expect(runDeletionWorker(envWithoutKv)).rejects.toThrow(
      'Deletion queue failed 1 of 1 entries',
    );
  });

  it('marks a fully processed entry done and resolves', async () => {
    const { client, updates } = queueClient({
      readData: [{ id: 'entry-4', user_id: 'user-4' }],
    });
    createClientMock.mockReturnValue(client);

    await expect(runDeletionWorker(envWithoutKv)).resolves.toBeUndefined();
    expect(updates[0]).toEqual({ status: 'processing' });
    expect(updates[1]).toMatchObject({ status: 'done' });
  });
});
