import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const BINDING_ID = "33333333-3333-4333-8333-333333333333";
const RECEIPT_ID = "44444444-4444-4444-8444-444444444444";
const UPSTREAM_ID = "55555555-5555-4555-8555-555555555555";
const SHA = "0123456789abcdef0123456789abcdef01234567";

const database = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  connection_vault_bindings: [] as Array<Record<string, unknown>>,
  project_connections: [] as Array<Record<string, unknown>>,
  missions: [] as Array<Record<string, unknown>>,
  approvals: [] as Array<Record<string, unknown>>,
  change_proposals: [] as Array<Record<string, unknown>>,
  mcp_tool_calls: [] as Array<Record<string, unknown>>,
}));

function rowsFor(
  table: keyof typeof database,
  filters: Array<[string, unknown]>,
) {
  return database[table].filter((row) =>
    filters.every(([column, value]) => row[column] === value),
  );
}

vi.mock("../../lib/supabaseClient.js", () => ({
  supabase: {
    from(table: keyof typeof database) {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        async maybeSingle() {
          const rows = rowsFor(table, filters);
          if (rows.length > 1) {
            return { data: null, error: { message: "multiple rows" } };
          }
          return { data: rows[0] ?? null, error: null };
        },
        async insert(value: Record<string, unknown>) {
          database[table].push(value);
          return { error: null };
        },
      };
      return builder;
    },
  },
}));

import { hubForMcpProject, resolveMcpRuntimeEnv } from "../vaultHub.js";
import { McpRegistry } from "../registry.js";

function proofModeResult() {
  return {
    isError: false,
    structuredContent: {
      repository: "jussray/founder-control-room",
      proofReceipt: {
        schema: "juss-proof/v1",
        receiptId: RECEIPT_ID,
        project: "jussray/founder-control-room",
        actor: "proofmode-github-mcp",
        authority: {
          provider: "github",
          scope: "repository",
          target: "jussray/founder-control-room",
          mode: "verify",
        },
        exactTarget: {
          repository: "jussray/founder-control-room",
          branch: "main",
          sha: SHA,
        },
        operation: "repository_evidence_audit",
        state: "inferred",
        evidence: [
          {
            type: "repository_snapshot",
            name: "GitHub evidence collected",
            state: "verified",
          },
        ],
        acknowledges: [UPSTREAM_ID],
        dependsOn: [UPSTREAM_ID],
        supersedes: [],
        nextAuthority: "runtime-provider-mcp",
        issuedAt: "2026-08-16T09:00:00.000Z",
      },
    },
  };
}

beforeEach(() => {
  database.projects.splice(0, database.projects.length, {
    id: PROJECT_ID,
    slug: "founder-control-room",
    repo_identifier: "jussray/founder-control-room",
  });
  database.connection_vault_bindings.splice(
    0,
    database.connection_vault_bindings.length,
    {
      id: BINDING_ID,
      project_id: PROJECT_ID,
      connection_id: CONNECTION_ID,
      environment: "development",
      name: "MCP_PROOFMODE_URL",
      kind: "variable",
      variable_value: "https://proofmode.example.test/mcp",
      status: "active",
    },
  );
  database.project_connections.splice(0, database.project_connections.length, {
    id: CONNECTION_ID,
    project_id: PROJECT_ID,
    status: "active",
  });
  database.missions.splice(0);
  database.approvals.splice(0);
  database.change_proposals.splice(0);
  database.mcp_tool_calls.splice(0);
  vi.restoreAllMocks();
});

describe("Connection Vault-backed MCP runtime", () => {
  it("resolves ProofMode only from the project-scoped Vault binding", async () => {
    const registry = new McpRegistry();
    const server = registry.get("proofmode");
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      MCP_VAULT_ENVIRONMENT: "development",
    };

    const runtime = await resolveMcpRuntimeEnv(server, "founder-control-room", env);

    expect(env.MCP_PROOFMODE_URL).toBeUndefined();
    expect(runtime.source).toBe("connection-vault");
    expect(runtime.bindingId).toBe(BINDING_ID);
    expect(runtime.connectionId).toBe(CONNECTION_ID);
    expect(runtime.env.MCP_PROOFMODE_URL).toBe("https://proofmode.example.test/mcp");
  });

  it("fails closed when the project has no active Vault endpoint binding", async () => {
    database.connection_vault_bindings.splice(0);
    const server = new McpRegistry().get("proofmode");

    await expect(
      resolveMcpRuntimeEnv(server, "founder-control-room", {
        NODE_ENV: "test",
        MCP_VAULT_ENVIRONMENT: "development",
        MCP_PROOFMODE_URL: "https://untrusted-process-env.example/mcp",
      }),
    ).rejects.toThrow(/not configured in Connection Vault/);
  });

  it("carries a ProofMode receipt through Vault resolution into FCR evidence without process-env fallback", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        id?: string;
        method?: string;
      };

      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "initialize") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "proofmode", version: "1.0.0" },
          },
        });
      }
      if (body.method === "tools/list") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "audit_repository",
                description: "Read-only repository audit",
                inputSchema: { type: "object" },
              },
            ],
          },
        });
      }
      if (body.method === "tools/call") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: proofModeResult(),
        });
      }
      return new Response("unexpected MCP method", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      MCP_VAULT_ENVIRONMENT: "development",
    };
    const hub = await hubForMcpProject("proofmode", "founder-control-room", { env });
    const result = await hub.invoke({
      serverId: "proofmode",
      projectId: "founder-control-room",
      toolName: "audit_repository",
      arguments: {
        owner: "jussray",
        repo: "founder-control-room",
        ref: SHA,
      },
    });

    expect(env.MCP_PROOFMODE_URL).toBeUndefined();
    expect(result.policy.decision).toBe("allow");
    expect(fetchMock).toHaveBeenCalled();

    const evidence = database.mcp_tool_calls.at(-1);
    expect(evidence?.status).toBe("passed");
    expect(evidence?.server_id).toBe("proofmode");
    expect(evidence?.response_summary).toMatchObject({
      federatedProof: {
        schema: "juss-proof/v1",
        receiptId: RECEIPT_ID,
        provider: "github",
        scope: "repository",
        exactSha: SHA,
        state: "inferred",
        acknowledges: [UPSTREAM_ID],
        dependsOn: [UPSTREAM_ID],
        nextAuthority: "runtime-provider-mcp",
      },
    });
  });
});
