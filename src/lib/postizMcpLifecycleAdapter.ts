import { FIRST_PARTY_SOCIAL_PLATFORMS, type FirstPartySocialPlatform } from './firstPartySocialPublisher.js';
import type {
  FounderContentLifecycleOperation,
  FounderContentProviderLifecycleAdapter,
  FounderContentProviderLifecycleEvidence,
  FounderContentProviderLifecycleRequest,
} from './founderContentLifecycle.js';
import { McpHttpClient } from '../mcp/client.js';
import type { McpServerDefinition, McpToolDefinition } from '../mcp/types.js';

export const POSTIZ_MCP_DEFAULT_URL = 'https://mcp.postiz.com/mcp' as const;

const POSTIZ_READ_OPERATIONS = ['list_accounts', 'get_post_status'] as const satisfies readonly FounderContentLifecycleOperation[];
const POSTIZ_READ_TOOLS = ['integrationList', 'postsListTool'] as const;

type JsonRecord = Record<string, unknown>;

export interface PostizMcpClient {
  listTools(): Promise<McpToolDefinition[]>;
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface PostizMcpLifecycleAdapterOptions {
  env?: NodeJS.ProcessEnv;
  client?: PostizMcpClient;
  now?: () => Date;
}

const POSTIZ_MCP_SERVER: McpServerDefinition = {
  id: 'postiz',
  label: 'Postiz MCP',
  role: 'social-distribution-provider-readback',
  endpointEnv: 'MCP_POSTIZ_URL',
  authTokenEnv: 'POSTIZ_API_KEY',
  enabledProjects: ['founder-control-room'],
  allowedToolPatterns: [...POSTIZ_READ_TOOLS],
  deniedToolPatterns: [
    'schedulePostTool',
    '*schedule*',
    '*publish*',
    '*create*',
    '*update*',
    '*delete*',
    '*upload*',
    '*generate*',
    '*trigger*',
    '*write*',
  ],
  defaultRisk: 'read',
  monthlyBudgetUsd: 0,
};

const PLATFORM_ALIASES: Record<FirstPartySocialPlatform, readonly string[]> = {
  linkedin: ['linkedin', 'linkedinpage'],
  facebook: ['facebook', 'facebookpage'],
  instagram: ['instagram'],
  threads: ['threads'],
  x: ['x', 'twitter'],
  tiktok: ['tiktok'],
  youtube: ['youtube'],
  pinterest: ['pinterest'],
  bluesky: ['bluesky'],
  mastodon: ['mastodon'],
  google_business: ['googlebusiness', 'googlemybusiness', 'googlebusinessprofile'],
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function normalizedPlatform(value: unknown): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function platformMatches(platform: FirstPartySocialPlatform, providerIdentifier: unknown): boolean {
  const normalized = normalizedPlatform(providerIdentifier);
  return PLATFORM_ALIASES[platform].includes(normalized);
}

function parsedTextContent(value: unknown): unknown {
  const payload = record(value);
  const structured = record(payload.structuredContent);
  if (Object.keys(structured).length > 0) return structured;

  if (Array.isArray(payload.content)) {
    for (const item of payload.content) {
      const entry = record(item);
      const body = text(entry.text);
      if (entry.type !== 'text' || !body) continue;
      try {
        return JSON.parse(body) as unknown;
      } catch {
        continue;
      }
    }
  }

  return value;
}

function outputOf(value: unknown): unknown {
  const payload = record(parsedTextContent(value));
  return Object.hasOwn(payload, 'output') ? payload.output : payload;
}

function postListOf(value: unknown): JsonRecord[] {
  const output = record(outputOf(value));
  return Array.isArray(output.posts) ? output.posts.map(record) : [];
}

function integrationListOf(value: unknown): JsonRecord[] {
  const output = outputOf(value);
  return Array.isArray(output) ? output.map(record) : [];
}

function utcWithoutMilliseconds(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, '');
}

function statusWindow(now: Date): { startDate: string; endDate: string } {
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  return {
    startDate: utcWithoutMilliseconds(new Date(now.getTime() - yearMs)),
    endDate: utcWithoutMilliseconds(new Date(now.getTime() + yearMs)),
  };
}

async function requireTool(client: PostizMcpClient, name: string): Promise<void> {
  const tools = await client.listTools();
  if (!tools.some((tool) => tool.name === name)) {
    throw new Error(`POSTIZ_MCP_TOOL_UNAVAILABLE: ${name}`);
  }
}

function observedAt(now: () => Date): string {
  return now().toISOString();
}

function unknownEvidence(
  operation: FounderContentLifecycleOperation,
  platform: FirstPartySocialPlatform,
  now: () => Date,
  reason: string,
  data: JsonRecord = {},
): FounderContentProviderLifecycleEvidence {
  return {
    operation,
    provider: 'postiz',
    platform,
    observedAt: observedAt(now),
    outcome: 'unknown',
    data: {
      ...data,
      truthState: 'UNKNOWN',
      reason,
      terminalPublicationVerified: false,
    },
  };
}

export function createPostizMcpLifecycleAdapter(
  options: PostizMcpLifecycleAdapterOptions = {},
): FounderContentProviderLifecycleAdapter {
  const baseEnv = options.env ?? process.env;
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    MCP_POSTIZ_URL: text(baseEnv.MCP_POSTIZ_URL) || POSTIZ_MCP_DEFAULT_URL,
  };
  const client: PostizMcpClient = options.client ?? new McpHttpClient(POSTIZ_MCP_SERVER, env);
  const now = options.now ?? (() => new Date());

  return {
    provider: 'postiz',
    supportedPlatforms: [...FIRST_PARTY_SOCIAL_PLATFORMS],
    supportedOperations: [...POSTIZ_READ_OPERATIONS],
    async execute(request: FounderContentProviderLifecycleRequest): Promise<FounderContentProviderLifecycleEvidence> {
      if (!POSTIZ_READ_OPERATIONS.includes(request.operation as (typeof POSTIZ_READ_OPERATIONS)[number])) {
        throw new Error(`POSTIZ_MCP_OPERATION_DENIED: ${request.operation}`);
      }

      if (request.operation === 'list_accounts') {
        await requireTool(client, 'integrationList');
        const result = await client.callTool('integrationList', {});
        const accounts = integrationListOf(result)
          .filter((integration) => platformMatches(request.platform, integration.platform))
          .map((integration) => ({
            id: text(integration.id),
            name: text(integration.name),
            platform: text(integration.platform),
            disabled: integration.disabled === true,
          }))
          .filter((integration) => Boolean(integration.id));

        return {
          operation: request.operation,
          provider: 'postiz',
          platform: request.platform,
          observedAt: observedAt(now),
          outcome: 'accepted',
          data: {
            accounts,
            providerTool: 'integrationList',
            publicationAuthorityGranted: false,
            terminalPublicationVerified: false,
          },
        };
      }

      const externalPostId = text(record(request.payload).externalPostId);
      if (!externalPostId) {
        return unknownEvidence(
          request.operation,
          request.platform,
          now,
          'No Postiz external post id is bound to this lifecycle record.',
        );
      }

      await requireTool(client, 'postsListTool');
      const window = statusWindow(now());
      const result = await client.callTool('postsListTool', window);
      const providerPost = postListOf(result).find((post) => text(post.id) === externalPostId);
      if (!providerPost) {
        return unknownEvidence(
          request.operation,
          request.platform,
          now,
          'Postiz did not return the requested post inside the bounded two-year status window.',
          { externalPostId, providerTool: 'postsListTool', ...window },
        );
      }

      const providerState = text(providerPost.state).toUpperCase();
      const providerPlatform = text(providerPost.platform);
      const platformAligned = platformMatches(request.platform, providerPlatform);
      if (!platformAligned) {
        return unknownEvidence(
          request.operation,
          request.platform,
          now,
          'Postiz returned the post under a different platform identity.',
          { externalPostId, providerState, providerPlatform },
        );
      }

      return {
        operation: request.operation,
        provider: 'postiz',
        platform: request.platform,
        observedAt: observedAt(now),
        outcome: providerState === 'ERROR' ? 'rejected' : 'accepted',
        externalPostId,
        data: {
          externalPostId,
          providerState,
          publishDate: text(providerPost.publishDate) || null,
          integrationId: text(providerPost.integrationId) || null,
          integrationName: text(providerPost.integrationName) || null,
          providerPlatform,
          providerTool: 'postsListTool',
          truthState: providerState === 'PUBLISHED' ? 'PROVIDER_REPORTED_PUBLISHED' : 'PROVIDER_REPORTED_STATE',
          terminalPublicationVerified: false,
          terminalProofReason: providerState === 'PUBLISHED'
            ? 'Postiz postsListTool does not return a destination-native permalink; provider state alone is not terminal destination proof.'
            : 'No terminal publication claim is made from this provider state.',
        },
      };
    },
  };
}

export function configuredPostizMcpLifecycleAdapters(
  env: NodeJS.ProcessEnv = process.env,
): Readonly<Record<string, FounderContentProviderLifecycleAdapter>> {
  if (!text(env.POSTIZ_API_KEY)) return Object.freeze({});
  return Object.freeze({
    postiz: createPostizMcpLifecycleAdapter({ env }),
  });
}
