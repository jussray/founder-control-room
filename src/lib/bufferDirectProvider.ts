export const BUFFER_GRAPHQL_URL = 'https://api.buffer.com' as const;

const BUFFER_ID = /^[0-9a-f]{24}$/i;
const DEFAULT_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

export interface BufferDirectProviderConfig {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface BufferAccountSummary {
  id: string;
  name: string | null;
  timezone: string | null;
  organizations: Array<{ id: string; name: string }>;
}

export interface BufferChannelSummary {
  id: string;
  name: string;
  displayName: string | null;
  service: string;
  isQueuePaused: boolean | null;
}

export interface BufferDraftReceipt {
  provider: 'buffer';
  state: 'BUFFER_ACCEPTED_DRAFT';
  postId: string;
  channelId: string;
  text: string;
  status: 'draft';
  allowedActions: string[];
}

export class BufferDirectProviderError extends Error {
  readonly code: string;
  readonly retrySafe: boolean;

  constructor(code: string, retrySafe = true) {
    super(code);
    this.name = 'BufferDirectProviderError';
    this.code = code;
    this.retrySafe = retrySafe;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function timeoutMs(value: number | undefined): number {
  if (!Number.isFinite(value) || Number(value) < 1_000 || Number(value) > 30_000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.trunc(Number(value));
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function requireId(value: unknown, code: string): string {
  const normalized = text(value);
  if (!BUFFER_ID.test(normalized)) throw new BufferDirectProviderError(code, true);
  return normalized;
}

function requireApiKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new BufferDirectProviderError('BUFFER_API_KEY_NOT_CONFIGURED', true);
  return normalized;
}

export function createBufferDirectProvider(config: BufferDirectProviderConfig) {
  const apiKey = requireApiKey(config.apiKey);
  const fetchImpl = config.fetchImpl ?? fetch;
  const requestTimeoutMs = timeoutMs(config.timeoutMs);

  async function graphql<T>(query: string, variables: JsonRecord = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetchImpl(BUFFER_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null) as JsonRecord | null;
      if (!response.ok) {
        throw new BufferDirectProviderError(`BUFFER_HTTP_${response.status}`, response.status >= 500);
      }

      const errors = Array.isArray(payload?.errors) ? payload?.errors : [];
      if (errors.length > 0) {
        throw new BufferDirectProviderError('BUFFER_GRAPHQL_ERROR', false);
      }

      if (!payload || !record(payload.data)) {
        throw new BufferDirectProviderError('BUFFER_GRAPHQL_DATA_MISSING', false);
      }

      return payload.data as T;
    } catch (error) {
      if (error instanceof BufferDirectProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BufferDirectProviderError('BUFFER_REQUEST_TIMEOUT', true);
      }
      throw new BufferDirectProviderError('BUFFER_REQUEST_FAILED', true);
    } finally {
      clearTimeout(timer);
    }
  }

  async function getAccount(): Promise<BufferAccountSummary> {
    const data = await graphql<{ account?: unknown }>(`
      query FcrBufferAccount {
        account {
          id
          name
          timezone
          organizations { id name }
        }
      }
    `);

    const account = record(data.account);
    const id = requireId(account?.id, 'BUFFER_ACCOUNT_ID_INVALID');
    const organizations = Array.isArray(account?.organizations)
      ? account!.organizations.map((item) => {
          const organization = record(item);
          return {
            id: requireId(organization?.id, 'BUFFER_ORGANIZATION_ID_INVALID'),
            name: text(organization?.name),
          };
        })
      : [];

    if (organizations.some((organization) => !organization.name)) {
      throw new BufferDirectProviderError('BUFFER_ORGANIZATION_NAME_MISSING', false);
    }

    return {
      id,
      name: text(account?.name) || null,
      timezone: text(account?.timezone) || null,
      organizations,
    };
  }

  async function listChannels(organizationId: string): Promise<BufferChannelSummary[]> {
    const orgId = requireId(organizationId, 'BUFFER_ORGANIZATION_ID_INVALID');
    const data = await graphql<{ channels?: unknown }>(`
      query FcrBufferChannels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) {
          id
          name
          displayName
          service
          isQueuePaused
        }
      }
    `, { organizationId: orgId });

    if (!Array.isArray(data.channels)) {
      throw new BufferDirectProviderError('BUFFER_CHANNELS_MISSING', false);
    }

    return data.channels.map((item) => {
      const channel = record(item);
      const name = text(channel?.name);
      const service = text(channel?.service);
      if (!name || !service) throw new BufferDirectProviderError('BUFFER_CHANNEL_INVALID', false);
      return {
        id: requireId(channel?.id, 'BUFFER_CHANNEL_ID_INVALID'),
        name,
        displayName: text(channel?.displayName) || null,
        service,
        isQueuePaused: typeof channel?.isQueuePaused === 'boolean' ? channel.isQueuePaused : null,
      };
    });
  }

  async function getPost(postId: string): Promise<{
    id: string;
    text: string;
    channelId: string;
    status: string;
    allowedActions: string[];
  }> {
    const id = requireId(postId, 'BUFFER_POST_ID_INVALID');
    const data = await graphql<{ post?: unknown }>(`
      query FcrBufferPost($id: PostId!) {
        post(input: { id: $id }) {
          id
          text
          channelId
          status
          allowedActions
        }
      }
    `, { id });

    const post = record(data.post);
    return {
      id: requireId(post?.id, 'BUFFER_POST_ID_INVALID'),
      text: text(post?.text),
      channelId: requireId(post?.channelId, 'BUFFER_CHANNEL_ID_INVALID'),
      status: text(post?.status).toLowerCase(),
      allowedActions: Array.isArray(post?.allowedActions)
        ? post!.allowedActions.map(text).filter(Boolean)
        : [],
    };
  }

  async function createDraftPost(input: {
    channelId: string;
    text: string;
  }): Promise<BufferDraftReceipt> {
    const channelId = requireId(input.channelId, 'BUFFER_CHANNEL_ID_INVALID');
    const body = input.text.trim();
    if (!body || body.length > 5_000) {
      throw new BufferDirectProviderError('BUFFER_DRAFT_TEXT_INVALID', true);
    }

    const data = await graphql<{ createPost?: unknown }>(`
      mutation FcrCreateBufferDraft($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post {
              id
              text
              channelId
              status
              allowedActions
            }
          }
          ... on MutationError {
            message
          }
        }
      }
    `, {
      input: {
        text: body,
        channelId,
        assets: [],
        needsApproval: false,
        schedulingType: 'automatic',
        mode: 'addToQueue',
        saveToDraft: true,
        source: 'founder-control-room',
      },
    });

    const result = record(data.createPost);
    const mutationMessage = text(result?.message);
    if (mutationMessage && !result?.post) {
      throw new BufferDirectProviderError('BUFFER_DRAFT_MUTATION_REJECTED', false);
    }

    const created = record(result?.post);
    const postId = requireId(created?.id, 'BUFFER_DRAFT_POST_ID_MISSING');

    const readback = await getPost(postId);
    if (readback.channelId !== channelId) {
      throw new BufferDirectProviderError('BUFFER_DRAFT_CHANNEL_MISMATCH', false);
    }
    if (readback.text !== body) {
      throw new BufferDirectProviderError('BUFFER_DRAFT_TEXT_MISMATCH', false);
    }
    if (readback.status !== 'draft') {
      throw new BufferDirectProviderError('BUFFER_DRAFT_READBACK_NOT_DRAFT', false);
    }

    return {
      provider: 'buffer',
      state: 'BUFFER_ACCEPTED_DRAFT',
      postId,
      channelId,
      text: body,
      status: 'draft',
      allowedActions: readback.allowedActions,
    };
  }

  return {
    getAccount,
    listChannels,
    getPost,
    createDraftPost,
  };
}
