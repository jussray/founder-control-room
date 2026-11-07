import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  listTools: vi.fn(),
  callTool: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../../lib/supabaseClient.js", () => ({
  supabase: {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() {
          return { data: { id: "11111111-1111-4111-8111-111111111111", repo_identifier: "jussray/Sekret-Bip" }, error: null };
        },
        insert: io.insert,
      };
      return query;
    },
  },
}));

vi.mock("../client.js", () => ({
  McpHttpClient: class {
    listTools = io.listTools;
    callTool = io.callTool;
  },
}));

import { McpHub } from "../hub.js";

const request = {
  serverId: "github",
  projectId: "sekret-bip",
  toolName: "search_code",
  arguments: { query: "public contract" },
};
const env = { NODE_ENV: "development", MCP_GITHUB_URL: "https://mcp.example.test/github" };

beforeEach(() => {
  vi.resetAllMocks();
  io.listTools.mockResolvedValue([{ name: "search_code", annotations: { readOnlyHint: true } }]);
  io.callTool.mockResolvedValue({ content: [{ type: "text", text: "read result" }] });
  io.insert.mockResolvedValue({ error: null });
});

describe("MCP capability freshness at invocation", () => {
  it("refreshes a primed cache and blocks read-to-write drift before tools/call", async () => {
    const hub = new McpHub(undefined, env);
    await hub.discoverCapabilities("github", "sekret-bip");
    io.listTools.mockResolvedValue([{ name: "search_code", annotations: { readOnlyHint: false } }]);
    await expect(hub.invoke(request)).rejects.toThrow(/after capability discovery/);
    expect(io.listTools).toHaveBeenCalledTimes(2);
    expect(io.callTool).not.toHaveBeenCalled();
    expect(io.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked", risk: "write" }));
  });

  it("rejects a tool removed since discovery", async () => {
    const hub = new McpHub(undefined, env);
    await hub.discoverCapabilities("github", "sekret-bip");
    io.listTools.mockResolvedValue([]);
    await expect(hub.invoke(request)).rejects.toThrow(/not advertised/);
    expect(io.callTool).not.toHaveBeenCalled();
  });

  it("fails closed when fresh discovery fails", async () => {
    const hub = new McpHub(undefined, env);
    await hub.discoverCapabilities("github", "sekret-bip");
    io.listTools.mockRejectedValue(new Error("discovery unavailable"));
    await expect(hub.invoke(request)).rejects.toThrow("discovery unavailable");
    expect(io.callTool).not.toHaveBeenCalled();
  });

  it("preserves a freshly advertised read-only call and its evidence", async () => {
    const hub = new McpHub(undefined, env);
    await hub.discoverCapabilities("github", "sekret-bip");
    const result = await hub.invoke(request);
    expect(io.listTools).toHaveBeenCalledTimes(2);
    expect(io.callTool).toHaveBeenCalledExactlyOnceWith("search_code", request.arguments);
    expect(result.policy).toMatchObject({ decision: "allow", risk: "read" });
    expect(io.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "passed", risk: "read" }));
  });
});
