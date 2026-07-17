import { randomUUID } from "node:crypto";
import type {
  JsonRpcResponse,
  McpServerDefinition,
  McpToolDefinition,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const PROTOCOL_VERSION = "2025-06-18";

function endpointFor(
  server: McpServerDefinition,
  env: NodeJS.ProcessEnv,
): URL {
  const raw = env[server.endpointEnv]?.trim();
  if (!raw) throw new Error(`MCP endpoint ${server.endpointEnv} is not configured`);
  const url = new URL(raw);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error(`MCP endpoint for ${server.id} must use http or https`);
  }
  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`MCP endpoint for ${server.id} must use https in production`);
  }
  return url;
}

function parseSsePayload(text: string): unknown {
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (!dataLines.length) throw new Error("MCP server returned an empty event stream");
  return JSON.parse(dataLines[dataLines.length - 1]);
}

async function readTextWithLimit(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error(`MCP response exceeded ${MAX_RESPONSE_BYTES} bytes`);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(`MCP response exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

interface CompletedResponse {
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
}

export class McpHttpClient {
  private sessionId?: string;
  private connected = false;

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

  private headers(): Record<string, string> {
    const token = this.server.authTokenEnv
      ? this.env[this.server.authTokenEnv]?.trim()
      : undefined;
    return {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
    };
  }

  private async post(
    body: Record<string, unknown>,
    readBody: boolean,
  ): Promise<CompletedResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const response = await fetch(endpointFor(this.server, this.env), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const returnedSessionId = response.headers.get("mcp-session-id");
      if (returnedSessionId) this.sessionId = returnedSessionId;

      const text = readBody ? await readTextWithLimit(response) : "";
      if (!readBody) await response.body?.cancel();

      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        text,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`MCP ${this.server.id} request timed out`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = randomUUID();
    const response = await this.post(
      { jsonrpc: "2.0", id, method, params },
      true,
    );
    if (!response.ok) {
      throw new Error(`MCP ${this.server.id} returned HTTP ${response.status}`);
    }
    if (!response.text.trim()) {
      throw new Error(`MCP ${this.server.id} returned an empty response for ${method}`);
    }

    const payload = response.contentType.includes("text/event-stream")
      ? parseSsePayload(response.text)
      : JSON.parse(response.text);
    const rpc = payload as JsonRpcResponse<T>;
    if (rpc.error) {
      throw new Error(`MCP ${this.server.id} error ${rpc.error.code}: ${rpc.error.message}`);
    }
    if (rpc.result === undefined) {
      throw new Error(`MCP ${this.server.id} returned no result for ${method}`);
    }
    return rpc.result;
  }

  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const response = await this.post(
      { jsonrpc: "2.0", method, params },
      false,
    );
    if (!response.ok) {
      throw new Error(
        `MCP ${this.server.id} notification returned HTTP ${response.status}`,
      );
    }
  }

  async initialize(): Promise<Record<string, unknown>> {
    if (this.connected) return {};
    const result = await this.rpc<Record<string, unknown>>("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "founder-control-room", version: "0.1.0" },
    });
    await this.notify("notifications/initialized");
    this.connected = true;
    return result;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    await this.initialize();
    const result = await this.rpc<{ tools?: McpToolDefinition[] }>("tools/list");
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    await this.initialize();
    return this.rpc("tools/call", { name: toolName, arguments: args });
  }
}
