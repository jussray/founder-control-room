import { describe, expect, it, vi } from 'vitest';
import {
  BUFFER_GRAPHQL_URL,
  BufferDirectProviderError,
  createBufferDirectProvider,
} from '../bufferDirectProvider.js';

const ACCOUNT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CHANNEL_ID = 'cccccccccccccccccccccccc';
const POST_ID = 'dddddddddddddddddddddddd';

function response(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buffer direct provider', () => {
  it('discovers account and channels through the official Buffer GraphQL endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        account: {
          id: ACCOUNT_ID,
          name: 'Juss Ray',
          timezone: 'America/New_York',
          organizations: [{ id: ORG_ID, name: 'Juss & Co.' }],
        },
      }))
      .mockResolvedValueOnce(response({
        channels: [{
          id: CHANNEL_ID,
          name: 'Juss&Co',
          displayName: 'Juss & Co.',
          service: 'facebook',
          isQueuePaused: false,
        }],
      }));

    const provider = createBufferDirectProvider({
      apiKey: 'test-buffer-key-never-log-this',
      fetchImpl,
    });

    await expect(provider.getAccount()).resolves.toMatchObject({
      id: ACCOUNT_ID,
      organizations: [{ id: ORG_ID, name: 'Juss & Co.' }],
    });
    await expect(provider.listChannels(ORG_ID)).resolves.toEqual([{
      id: CHANNEL_ID,
      name: 'Juss&Co',
      displayName: 'Juss & Co.',
      service: 'facebook',
      isQueuePaused: false,
    }]);

    for (const call of fetchImpl.mock.calls) {
      expect(call[0]).toBe(BUFFER_GRAPHQL_URL);
      const init = call[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-buffer-key-never-log-this');
      expect(String(init.body)).not.toContain('test-buffer-key-never-log-this');
    }
  });

  it('creates only a Buffer draft and verifies provider readback before returning a receipt', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        createPost: {
          post: {
            id: POST_ID,
            text: 'Draft proof only',
            channelId: CHANNEL_ID,
            status: 'draft',
            allowedActions: ['editPost'],
          },
        },
      }))
      .mockResolvedValueOnce(response({
        post: {
          id: POST_ID,
          text: 'Draft proof only',
          channelId: CHANNEL_ID,
          status: 'draft',
          allowedActions: ['editPost'],
        },
      }));

    const provider = createBufferDirectProvider({
      apiKey: 'test-buffer-key-never-log-this',
      fetchImpl,
    });

    await expect(provider.createDraftPost({
      channelId: CHANNEL_ID,
      text: 'Draft proof only',
    })).resolves.toEqual({
      provider: 'buffer',
      state: 'BUFFER_ACCEPTED_DRAFT',
      postId: POST_ID,
      channelId: CHANNEL_ID,
      text: 'Draft proof only',
      status: 'draft',
      allowedActions: ['editPost'],
    });

    const createBody = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
    expect(createBody.variables.input).toMatchObject({
      channelId: CHANNEL_ID,
      text: 'Draft proof only',
      assets: [],
      needsApproval: false,
      schedulingType: 'automatic',
      mode: 'addToQueue',
      saveToDraft: true,
      source: 'founder-control-room',
    });
    expect(createBody.variables.input).not.toHaveProperty('dueAt');
  });

  it('fails closed when provider readback is not a draft', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        createPost: { post: { id: POST_ID } },
      }))
      .mockResolvedValueOnce(response({
        post: {
          id: POST_ID,
          text: 'Draft proof only',
          channelId: CHANNEL_ID,
          status: 'scheduled',
          allowedActions: [],
        },
      }));

    const provider = createBufferDirectProvider({
      apiKey: 'test-buffer-key-never-log-this',
      fetchImpl,
    });

    await expect(provider.createDraftPost({
      channelId: CHANNEL_ID,
      text: 'Draft proof only',
    })).rejects.toMatchObject({
      code: 'BUFFER_DRAFT_READBACK_NOT_DRAFT',
    });
  });

  it('requires a server-side API key before any provider call', () => {
    expect(() => createBufferDirectProvider({ apiKey: ' ' }))
      .toThrowError(BufferDirectProviderError);
  });
});
