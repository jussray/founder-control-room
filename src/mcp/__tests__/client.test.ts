import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpHttpClient } from "../client.js";
import type { McpServerDefinition } from "../types.js";

const calls: Array<{
  method?: string;
  session?: string;
}> = [];

let server: Server;
let endpoint = "";

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      id?: string;
      method?: string;
      params?: Record<string, unknown>;
    };
    const session = req.headers["mcp-session-id"];
    calls.push({
      method: body.method,
      session: typeof session === "string" ? session : undefined,
    });

    if (body.method === "notifications/initialized") {
      res.statusCode = 202;
      res.end();
      return;
    }

    res.setHeader("content-type", "application/json");
    if (body.method === "initialize") {
      res.setHeader("mcp-session-id", "phase-one-session");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "test-mcp", version: "1.0.0" },
          },
        }),
      );
      return;
    }

    if (body.method === "tools/list") {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "search_code",
                description: "Read-only search",
                inputSchema: { type: "object" },
              },
              {
                name: "oversized",
                description: "Test-only oversized response",
                inputSchema: { type: "object" },
              },
            ],
          },
        }),
      );
      return;
    }

    if (body.method === "tools/call") {
      if (body.params?.name === "oversized") {
        res.write(`{"jsonrpc":"2.0","id":"${body.id}","result":{"text":"`);
        for (let index = 0; index < 17; index += 1) {
          res.write("x".repeat(65_536));
        }
        res.end('"}}');
        return;
      }

      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { content: [{ type: "text", text: "ok" }] },
        }),
      );
      return;
    }

    res.statusCode = 400;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${address.port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

function definition(): McpServerDefinition {
  return {
    id: "test",
    label: "Test MCP",
    role: "test",
    endpointEnv: "MCP_TEST_URL",
    enabledProjects: ["founder-control-room"],
    allowedToolPatterns: ["search_*", "oversized"],
    deniedToolPatterns: [],
    defaultRisk: "read",
    monthlyBudgetUsd: 0,
  };
}

function client(): McpHttpClient {
  return new McpHttpClient(definition(), {
    NODE_ENV: "test",
    MCP_TEST_URL: endpoint,
    MCP_REQUEST_TIMEOUT_MS: "5000",
  });
}

describe("McpHttpClient", () => {
  it("initializes, preserves the MCP session, lists tools, and invokes a tool", async () => {
    const mcp = client();

    await expect(mcp.listTools()).resolves.toEqual([
      expect.objectContaining({ name: "search_code" }),
      expect.objectContaining({ name: "oversized" }),
    ]);
    await expect(mcp.callTool("search_code", { query: "RoomBackground" }))
      .resolves.toEqual({ content: [{ type: "text", text: "ok" }] });

    expect(calls.map((call) => call.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/call",
    ]);
    expect(calls.slice(1).every((call) => call.session === "phase-one-session"))
      .toBe(true);
  });

  it("aborts a streamed response as soon as it exceeds the byte cap", async () => {
    await expect(client().callTool("oversized", {})).rejects.toThrow(
      /MCP response exceeded 1000000 bytes/,
    );
  });
});
