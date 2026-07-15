import { randomUUID } from "node:crypto";
import type {
  JsonRpcResponse,
  McpServerDefinition,
  McpToolDefinition,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;

function endpointFor(
  server: McpServerDefinition,
  env: NodeJS.ProcessEnv,
): URL {
  const raw = env[server.endpointEnv]?.trim();
  if (!raw) throw new Error(`MCP endpoint ${server.endpointEnv} is not configured`);
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error(`MCP endpoint for ${server.id} must use http or https`);
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error(`MCP endpoint for ${server.id} must use https in production`);
  }
  return url;
}

function parseSsePayload(text: string): unknown {
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (!dataLines.length) throw new Error('MCP server returned an empty event stream');
  return JSON.parse(dataLines[dataLines.length - 1]);
}

export class McpHttpClient {
  constructor(
    private readonly server: McpServerDefinition,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  private timeoutMs(): number {
    const configured = Number(this.env.MCP_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    if (!Number.isFinite(configured) || configured < 500 || configured > 60_000) {
      return DEFAULT_TIMEOUT_MS;
    }
    return configured;
  }

  private async rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const endpoint = endpointFor(this.server, this.env);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    const token = this.server.authTokenEnv
      ? this.env[this.server.authTokenEnv]?.trim()
      : undefined;
    const id = randomUUID();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
        throw new Error(`MCP response exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      if (!response.ok) {
        throw new Error(`MCP ${this.server.id} returned HTTP ${response.status}`);
      }

      const payload = response.headers.get('content-type')?.includes('text/event-stream')
        ? parseSsePayload(text)
        : JSON.parse(text);
      const rpc = payload as JsonRpcResponse<T>;
      if (rpc.error) {
        throw new Error(`MCP ${this.server.id} error ${rpc.error.code}: ${rpc.error.message}`);
      }
      if (rpc.result === undefined) {
        throw new Error(`MCP ${this.server.id} returned no result for ${method}`);
      }
      return rpc.result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MCP ${this.server.id} request timed out`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async initialize(): Promise<Record<string, unknown>> {
    return this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'founder-control-room', version: '0.1.0' },
    });
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.rpc<{ tools?: McpToolDefinition[] }>('tools/list');
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return this.rpc('tools/call', { name: toolName, arguments: args });
  }
}
