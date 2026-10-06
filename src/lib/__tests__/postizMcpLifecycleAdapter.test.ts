import { describe, expect, it } from 'vitest';
import type { McpToolDefinition } from '../../mcp/types.js';
import {
  configuredPostizMcpLifecycleAdapters,
  createPostizMcpLifecycleAdapter,
  type PostizMcpClient,
} from '../postizMcpLifecycleAdapter.js';

type JsonRecord = Record<string, unknown>;

class FakePostizClient implements PostizMcpClient {
  readonly calls: Array<{ toolName: string; args: Record<string, unknown> }> = [];

  constructor(
    private readonly tools: McpToolDefinition[],
    private readonly results: Record<string, unknown>,
  ) {}

  async listTools(): Promise<McpToolDefinition[]> {
    return this.tools;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ toolName, args });
    if (!Object.hasOwn(this.results, toolName)) {
      throw new Error(`unexpected tool call: ${toolName}`);
    }
    return this.results[toolName];
  }
}

const NOW = new Date('2026-09-20T20:00:00.000Z');

describe('Postiz MCP lifecycle adapter', () => {
  it('stays unavailable when the server-only Postiz credential is absent', () => {
    expect(configuredPostizMcpLifecycleAdapters({ NODE_ENV: 'test' })).toEqual({});
  });

  it('registers only the bounded Postiz read adapter when the server credential exists', () => {
    const adapters = configuredPostizMcpLifecycleAdapters({
      NODE_ENV: 'test',
      POSTIZ_API_KEY: 'test-only-postiz-key',
      MCP_POSTIZ_URL: 'https://mcp.postiz.com/mcp',
    });

    expect(Object.keys(adapters)).toEqual(['postiz']);
    expect(adapters.postiz).toMatchObject({
      provider: 'postiz',
      supportedOperations: ['list_accounts', 'get_post_status'],
    });
    expect(adapters.postiz.supportedOperations).not.toContain('publish_now');
  });

  it('lists only accounts matching the requested FCR platform', async () => {
    const client = new FakePostizClient(
      [{ name: 'integrationList' }],
      {
        integrationList: {
          structuredContent: {
            output: [
              { id: 'li-1', name: 'Founder LinkedIn', platform: 'linkedin', disabled: false },
              { id: 'x-1', name: 'Founder X', platform: 'x', disabled: false },
            ],
          },
        },
      },
    );
    const adapter = createPostizMcpLifecycleAdapter({ client, now: () => NOW });

    const evidence = await adapter.execute({
      operation: 'list_accounts',
      platform: 'linkedin',
      payload: {},
    });

    expect(evidence).toMatchObject({
      provider: 'postiz',
      platform: 'linkedin',
      outcome: 'accepted',
      observedAt: NOW.toISOString(),
    });
    expect(evidence.data).toMatchObject({
      accounts: [{ id: 'li-1', name: 'Founder LinkedIn', platform: 'linkedin', disabled: false }],
      publicationAuthorityGranted: false,
      terminalPublicationVerified: false,
    });
    expect(client.calls).toEqual([{ toolName: 'integrationList', args: {} }]);
  });

  it('keeps Postiz-reported PUBLISHED state non-terminal without a native permalink', async () => {
    const client = new FakePostizClient(
      [{ name: 'postsListTool' }],
      {
        postsListTool: {
          output: {
            posts: [
              {
                id: 'post-123',
                publishDate: '2026-09-20T19:55:00',
                state: 'PUBLISHED',
                content: 'private copy intentionally ignored by FCR evidence',
                settings: { secretish: 'ignored' },
                group: 'group-1',
                integrationId: 'li-1',
                platform: 'linkedin',
                integrationName: 'Founder LinkedIn',
              },
            ],
          },
        },
      },
    );
    const adapter = createPostizMcpLifecycleAdapter({ client, now: () => NOW });

    const evidence = await adapter.execute({
      operation: 'get_post_status',
      platform: 'linkedin',
      postId: 'local-1',
      accountId: 'li-1',
      payload: { externalPostId: 'post-123' },
    });

    expect(evidence).toMatchObject({
      provider: 'postiz',
      outcome: 'accepted',
      externalPostId: 'post-123',
    });
    expect(evidence.permalink).toBeUndefined();
    expect(evidence.data).toMatchObject({
      providerState: 'PUBLISHED',
      truthState: 'PROVIDER_REPORTED_PUBLISHED',
      terminalPublicationVerified: false,
    });
    const data = evidence.data as JsonRecord;
    expect(data).not.toHaveProperty('content');
    expect(data).not.toHaveProperty('settings');
    expect(String(data.terminalProofReason)).toMatch(/does not return a destination-native permalink/i);
    expect(client.calls[0]).toMatchObject({ toolName: 'postsListTool' });
  });

  it('does not advertise or execute Postiz publication writes through the lifecycle adapter', async () => {
    const client = new FakePostizClient(
      [
        { name: 'integrationList' },
        { name: 'postsListTool' },
        { name: 'schedulePostTool' },
      ],
      {},
    );
    const adapter = createPostizMcpLifecycleAdapter({ client, now: () => NOW });

    expect(adapter.supportedOperations).toEqual(['list_accounts', 'get_post_status']);
    expect(adapter.supportedOperations).not.toContain('publish_now');
    await expect(adapter.execute({
      operation: 'publish_now',
      platform: 'linkedin',
      payload: {},
    })).rejects.toThrow(/POSTIZ_MCP_OPERATION_DENIED/);
    expect(client.calls).toEqual([]);
  });

  it('fails closed when a required Postiz read tool is not advertised', async () => {
    const client = new FakePostizClient([], {});
    const adapter = createPostizMcpLifecycleAdapter({ client, now: () => NOW });

    await expect(adapter.execute({
      operation: 'list_accounts',
      platform: 'x',
      payload: {},
    })).rejects.toThrow(/POSTIZ_MCP_TOOL_UNAVAILABLE: integrationList/);
  });
});
