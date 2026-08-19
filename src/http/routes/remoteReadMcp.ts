import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response as ExpressResponse } from 'express';
import { McpHub } from '../../mcp/hub.js';
import { assertNoSecretArguments } from '../../mcp/safety.js';
import { hubForMcpProject } from '../../mcp/vaultHub.js';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const READ_TOOL_NAME = 'invoke_read_tool';
const LIST_SERVERS_TOOL_NAME = 'list_read_servers';
const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

type JsonRecord = Record<string, unknown>;
type JsonRpcId = string | number | null;

export interface RemoteReadMcpDependencies {
  env?: NodeJS.ProcessEnv;
  listServers?: () => unknown;
  invokeReadTool?: (input: {
    serverId: string;
    projectId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }) => Promise<unknown>;
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

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRecord {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function boundedString(value: unknown, maxLength = 120): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function bearerToken(req: Request): string | null {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return boundedString(authorization.slice('Bearer '.length), 4096);
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function configuredProjectScope(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.FCR_REMOTE_MCP_READ_PROJECTS?.trim() ?? '';
  const projects = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (projects.length === 0 || projects.some((project) => !PROJECT_SLUG.test(project))) {
    return new Set();
  }
  return new Set(projects);
}

function scopedRegistryView(value: unknown, allowedProjects: Set<string>): unknown {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.enabledProjects)) return [];
    const enabledProjects = entry.enabledProjects.filter(
      (project): project is string => typeof project === 'string' && allowedProjects.has(project),
    );
    return enabledProjects.length > 0 ? [{ ...entry, enabledProjects }] : [];
  });
}

function toolDefinitions() {
  return [
    {
      name: LIST_SERVERS_TOOL_NAME,
      title: 'List read-only MCP servers',
      description:
        'List only MCP provider registry entries available to this server-held project scope. This tool cannot invoke a provider.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: READ_TOOL_NAME,
      title: 'Invoke an approved read-only MCP tool',
      description:
        'Route a project-scoped provider read through Founder Control Room. The server-held project scope and FCR provider policy both must allow the request before provider execution.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['serverId', 'projectId', 'toolName'],
        properties: {
          serverId: { type: 'string', minLength: 1, maxLength: 120 },
          projectId: { type: 'string', minLength: 1, maxLength: 120 },
          toolName: { type: 'string', minLength: 1, maxLength: 160 },
          arguments: { type: 'object', additionalProperties: true },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
  ];
}

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}

async function defaultInvokeReadTool(input: {
  serverId: string;
  projectId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  const hub = await hubForMcpProject(input.serverId, input.projectId);
  const result = await hub.invoke({
    serverId: input.serverId,
    projectId: input.projectId,
    toolName: input.toolName,
    arguments: input.arguments,
  });

  if (result.policy.decision !== 'allow' || result.policy.risk !== 'read') {
    throw new Error('Remote read MCP refused a non-read policy result.');
  }
  return result;
}

export function createRemoteReadMcpHandler(
  overrides: RemoteReadMcpDependencies = {},
): RequestHandler {
  const env = overrides.env ?? process.env;
  const registryHub = new McpHub();
  const listServers = overrides.listServers ?? (() => registryHub.listServers());
  const invokeReadTool = overrides.invokeReadTool ?? defaultInvokeReadTool;

  return async (req: Request, res: ExpressResponse): Promise<void> => {
    const configuredToken = env.FCR_REMOTE_MCP_READ_TOKEN?.trim();
    const allowedProjects = configuredProjectScope(env);
    if (!configuredToken || allowedProjects.size === 0) {
      res.status(503).json(
        rpcError(null, -32001, 'Remote read MCP token or project scope is not configured'),
      );
      return;
    }

    const token = bearerToken(req);
    if (!token || !secureEqual(token, configuredToken)) {
      res.status(401).json(rpcError(null, -32000, 'Unauthorized'));
      return;
    }

    const body = req.body as JsonRecord;
    const id = rpcId(body?.id);
    if (!isRecord(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      res.status(400).json(rpcError(id, -32600, 'Invalid JSON-RPC request'));
      return;
    }

    if (body.method === 'notifications/initialized') {
      res.status(204).send();
      return;
    }
    if (body.method === 'initialize') {
      res.json(
        rpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'founder-control-room-read', version: '0.1.0' },
          instructions:
            'Read-only Founder Control Room gateway. Provider mutations, credentials, cross-project access, and authority-bearing calls are not exposed.',
        }),
      );
      return;
    }
    if (body.method === 'ping') {
      res.json(rpcResult(id, {}));
      return;
    }
    if (body.method === 'tools/list') {
      res.json(rpcResult(id, { tools: toolDefinitions() }));
      return;
    }
    if (body.method !== 'tools/call') {
      res.status(404).json(rpcError(id, -32601, `Method not found: ${body.method}`));
      return;
    }

    const params = isRecord(body.params) ? body.params : null;
    const name = boundedString(params?.name, 120);
    const args = isRecord(params?.arguments) ? params.arguments : {};

    if (name === LIST_SERVERS_TOOL_NAME) {
      if (Object.keys(args).length > 0) {
        res.status(400).json(rpcError(id, -32602, 'list_read_servers accepts no arguments'));
        return;
      }
      res.json(
        rpcResult(id, toolResult(scopedRegistryView(listServers(), allowedProjects))),
      );
      return;
    }

    if (name !== READ_TOOL_NAME) {
      res.status(400).json(rpcError(id, -32602, 'Unknown remote read MCP tool'));
      return;
    }

    const unexpected = Object.keys(args).filter(
      (key) => !['serverId', 'projectId', 'toolName', 'arguments'].includes(key),
    );
    if (unexpected.length > 0) {
      res.status(400).json(
        rpcError(id, -32602, 'Unexpected invoke_read_tool arguments', unexpected.sort()),
      );
      return;
    }

    const serverId = boundedString(args.serverId);
    const projectId = boundedString(args.projectId);
    const toolName = boundedString(args.toolName, 160);
    const toolArguments = args.arguments === undefined ? {} : args.arguments;
    if (!serverId || !projectId || !toolName || !isRecord(toolArguments)) {
      res.status(400).json(
        rpcError(
          id,
          -32602,
          'serverId, projectId, toolName, and object arguments are required',
        ),
      );
      return;
    }
    if (!allowedProjects.has(projectId)) {
      res.status(403).json(
        rpcError(id, -32003, 'Requested project is outside this remote MCP grant'),
      );
      return;
    }

    try {
      assertNoSecretArguments(toolArguments);
      const result = await invokeReadTool({
        serverId,
        projectId,
        toolName,
        arguments: toolArguments,
      });
      res.json(rpcResult(id, toolResult(result)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blocked = /blocked|denied|allowlist|not enabled|non-read/i.test(message);
      res.status(blocked ? 403 : 400).json(
        rpcError(id, blocked ? -32003 : -32602, message),
      );
    }
  };
}

export const handleRemoteReadMcp = createRemoteReadMcpHandler();
