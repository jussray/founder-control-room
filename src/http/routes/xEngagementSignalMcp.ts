import type { Request, RequestHandler, Response as ExpressResponse } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import {
  XEngagementSignalService,
  createSupabaseXEngagementSignalStore,
  gate3StateFromXEngagement,
  resolveXEngagementRuntimeConfig,
  type XEngagementSignal,
} from '../../lib/xEngagementSignal.js';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const TOOL_NAME = 'get_x_engagement_signal';
const MAX_PROJECT_ID_LENGTH = 100;
const MAX_TOPIC_LENGTH = 120;

type JsonRecord = Record<string, unknown>;
type JsonRpcId = string | number | null;

type QueryArguments = Readonly<{
  projectId: string;
  topic: string;
}>;

export interface XEngagementSignalMcpDependencies {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  getSignal?: (args: QueryArguments) => Promise<XEngagementSignal>;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rpcId(value: unknown): JsonRpcId {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function rpcResult(id: JsonRpcId, result: unknown): JsonRecord {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRecord {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function parseArguments(value: unknown): { value: QueryArguments | null; errors: string[] } {
  if (!isRecord(value)) return { value: null, errors: ['arguments must be an object'] };

  const allowed = new Set(['projectId', 'topic']);
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`unexpected argument: ${key}`);
  }

  const projectId = boundedString(value.projectId, MAX_PROJECT_ID_LENGTH);
  const topic = boundedString(value.topic, MAX_TOPIC_LENGTH);
  if (!projectId) errors.push('projectId is required');
  if (!topic) errors.push('topic is required');

  return errors.length > 0 || !projectId || !topic
    ? { value: null, errors }
    : { value: Object.freeze({ projectId, topic }), errors: [] };
}

function toolDefinition(): JsonRecord {
  return {
    name: TOOL_NAME,
    title: 'Get X engagement signal',
    description:
      'Read one normalized, aggregate X topic engagement signal from Founder Control Room. UNKNOWN means HOLD. The tool cannot publish, mutate content, expose raw posts, or increase authority.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectId', 'topic'],
      properties: {
        projectId: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_PROJECT_ID_LENGTH,
          description:
            'Requesting FCR project identifier for provenance. It does not partition the reusable public-market cache.',
        },
        topic: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_TOPIC_LENGTH,
          description: 'Public-market topic to qualify.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  };
}

function toolResponse(signal: XEngagementSignal): JsonRecord {
  const gate3 = gate3StateFromXEngagement(signal);
  const text = signal.status === 'KNOWN'
    ? `X engagement signal is known. Topic median engagement: ${signal.topicMedianEngagement}. Gate 3 is ready for the separate owned-median comparison.`
    : `X engagement signal is UNKNOWN (${signal.reason}). Gate 3 must HOLD.`;

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      signal,
      gate3,
      authority: {
        observationOnly: true,
        canPublish: false,
        canChangeContent: false,
        canIncreaseAuthority: false,
      },
    },
    isError: false,
  };
}

function defaultGetSignal(
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
): (args: QueryArguments) => Promise<XEngagementSignal> {
  const service = new XEngagementSignalService({
    config: resolveXEngagementRuntimeConfig(env),
    store: createSupabaseXEngagementSignalStore(supabase),
    fetchImpl: fetchFn,
  });
  return (args) => service.getTopicEngagement(args);
}

export function createXEngagementSignalMcpHandler(
  overrides: XEngagementSignalMcpDependencies = {},
): RequestHandler {
  const env = overrides.env ?? process.env;
  const fetchFn = overrides.fetchFn ?? fetch;
  const getSignal = overrides.getSignal ?? defaultGetSignal(env, fetchFn);

  return async (req: Request, res: ExpressResponse): Promise<void> => {
    const body = req.body;
    const id = isRecord(body) ? rpcId(body.id) : null;
    if (!isRecord(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      res.status(400).json(rpcError(id, -32600, 'Invalid JSON-RPC request'));
      return;
    }

    if (body.method === 'notifications/initialized') {
      res.status(204).send();
      return;
    }
    if (body.method === 'initialize') {
      res.json(rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'founder-signal-x-engagement', version: '1.0.0' },
      }));
      return;
    }
    if (body.method === 'ping') {
      res.json(rpcResult(id, {}));
      return;
    }
    if (body.method === 'tools/list') {
      res.json(rpcResult(id, { tools: [toolDefinition()] }));
      return;
    }
    if (body.method !== 'tools/call') {
      res.status(404).json(rpcError(id, -32601, `Method not found: ${body.method}`));
      return;
    }

    const params = isRecord(body.params) ? body.params : null;
    if (!params || params.name !== TOOL_NAME) {
      res.status(400).json(rpcError(id, -32602, `Only ${TOOL_NAME} is available`));
      return;
    }

    const parsed = parseArguments(params.arguments);
    if (!parsed.value) {
      res.status(400).json(rpcError(id, -32602, 'Invalid tool arguments', parsed.errors));
      return;
    }

    try {
      const signal = await getSignal(parsed.value);
      res.json(rpcResult(id, toolResponse(signal)));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown signal lookup failure';
      res.status(500).json(rpcError(id, -32603, 'X engagement signal lookup failed', { detail }));
    }
  };
}

export const handleXEngagementSignalMcp = createXEngagementSignalMcpHandler();
