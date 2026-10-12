import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MCP authorization-denial harness.
 *
 * Behavior under test: McpHub.invoke must refuse non-read tool calls and any
 * approval-bearing call that fails project provenance, without ever reaching
 * the provider endpoint. Provider reachability is observed by counting fetch
 * calls to the stubbed MCP endpoint. All data is synthetic; no network, no
 * Supabase, no credentials.
 *
 * Scope notes (do not widen without evidence):
 * - The approvals table has no expiry, revocation or consumption columns
 *   (supabase/migrations/20260711030127_init_control_room_schema.sql). The hub
 *   enforces only decision === "approved". Expiry, revocation and one-time
 *   consumption are NOT enforced and need a schema decision before any test
 *   can claim them.
 */

const database = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  missions: [] as Array<Record<string, unknown>>,
  approvals: [] as Array<Record<string, unknown>>,
  change_proposals: [] as Array<Record<string, unknown>>,
  mcp_tool_calls: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../lib/supabaseClient.js", () => ({
  supabase: {
    from(table: keyof typeof database) {
      return {
        select() {
          let filterColumn = "";
          let filterValue: unknown;
          const query = {
            eq(column: string, value: unknown) {
              filterColumn = column;
              filterValue = value;
              return query;
            },
            async maybeSingle() {
              const row = database[table].find(
                (candidate) => candidate[filterColumn] === filterValue,
              );
              return { data: row ?? null, error: null };
            },
          };
          return query;
        },
        async insert(row: Record<string, unknown>) {
          database[table].push(row);
          return { error: null };
        },
      };
    },
  },
}));

import { McpHub } from "../hub.js";
import { McpRegistry } from "../registry.js";

const PROJECT_OWN = "11111111-1111-4111-8111-111111111111";
const PROJECT_OTHER = "22222222-2222-4222-8222-222222222222";
const MISSION_OWN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MISSION_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROPOSAL_OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const APPROVAL_VALID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const APPROVAL_CROSS_PROJECT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const APPROVAL_REVOKED = "99999999-9999-4999-8999-999999999999";

const PROJECT_SLUG = "l99"; // present in ACTIVE_PROJECT_SLUGS (src/config/portfolio.ts)
const ENV = { MCP_GITHUB_URL: "https://mcp.example.test/github" };

const providerMethods: string[] = [];

function stubProvider(input: unknown, init?: RequestInit): Promise<Response> {
  void input;
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    id?: string;
    method?: string;
  };
  if (body.method) providerMethods.push(body.method);
  if (body.method === "notifications/initialized") {
    return Promise.resolve(new Response(null, { status: 202 }));
  }
  const result =
    body.method === "initialize"
      ? { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "stub" } }
      : body.method === "tools/list"
        ? { tools: [{ name: "get_issue", inputSchema: { type: "object" } }] }
        : { content: [{ type: "text", text: "ok" }] };
  return Promise.resolve(
    new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function newHub(env: NodeJS.ProcessEnv = ENV) {
  return new McpHub(new McpRegistry(), env);
}

function evidenceRows() {
  return database.mcp_tool_calls;
}

beforeEach(() => {
  providerMethods.length = 0;
  database.mcp_tool_calls.splice(0);
  database.projects.splice(0, database.projects.length,
    { id: PROJECT_OWN, slug: PROJECT_SLUG, repo_identifier: "jussray/l99" },
    { id: PROJECT_OTHER, slug: "sekret-bip", repo_identifier: "jussray/Sekret-Bip" },
  );
  database.missions.splice(0, database.missions.length,
    { id: MISSION_OWN, project_id: PROJECT_OWN },
    { id: MISSION_OTHER, project_id: PROJECT_OTHER },
  );
  database.change_proposals.splice(0, database.change_proposals.length,
    { id: PROPOSAL_OTHER, project_id: PROJECT_OTHER, mission_id: MISSION_OTHER },
  );
  database.approvals.splice(0, database.approvals.length,
    // Same project, approved. Must still NOT authorize a mutation.
    { id: APPROVAL_VALID, mission_id: MISSION_OWN, change_proposal_id: null, decision: "approved" },
    // Belongs to another project through its change proposal.
    { id: APPROVAL_CROSS_PROJECT, mission_id: null, change_proposal_id: PROPOSAL_OTHER, decision: "approved" },
    // Same project, explicitly denied. The schema's only non-approved decision.
    { id: APPROVAL_REVOKED, mission_id: MISSION_OWN, change_proposal_id: null, decision: "denied" },
  );
  vi.stubGlobal("fetch", vi.fn(stubProvider));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MCP mutation denial harness", () => {
  it("control: an allowlisted read tool for an enabled project reaches the provider", async () => {
    const result = await newHub().invoke({
      serverId: "github",
      toolName: "get_issue",
      projectId: PROJECT_SLUG,
      arguments: { number: 1 },
    });

    expect(result).toBeDefined();
    expect(providerMethods).toContain("tools/call");
    expect(evidenceRows().some((row) => row.status === "passed")).toBe(true);
  });

  it("denies an explicitly denied write tool with no approval and never calls the provider", async () => {
    await expect(
      newHub().invoke({
        serverId: "github",
        toolName: "create_issue",
        projectId: PROJECT_SLUG,
        arguments: { title: "synthetic" },
      }),
    ).rejects.toThrow(/MCP invocation blocked .*Tool is explicitly denied/);

    expect(providerMethods).toEqual([]);
    expect(evidenceRows()).toHaveLength(1);
    expect(evidenceRows()[0]).toMatchObject({ status: "blocked", policy_decision: "deny" });
  });

  it("requires approval for an allowlisted tool whose name implies a write, and never calls the provider", async () => {
    await expect(
      newHub().invoke({
        serverId: "github",
        toolName: "get_publish_status",
        projectId: PROJECT_SLUG,
        arguments: {},
      }),
    ).rejects.toThrow(/mutations require a separately approved mission/);

    expect(providerMethods).toEqual([]);
    expect(evidenceRows()[0]).toMatchObject({
      status: "blocked",
      policy_decision: "requires_approval",
      approval_id: null,
    });
  });

  it("a valid same-project approval does not authorize a mutation tool call", async () => {
    await expect(
      newHub().invoke({
        serverId: "github",
        toolName: "get_publish_status",
        projectId: PROJECT_SLUG,
        missionId: MISSION_OWN,
        approvalId: APPROVAL_VALID,
        arguments: {},
      }),
    ).rejects.toThrow(/MCP invocation blocked/);

    expect(providerMethods).toEqual([]);
    expect(evidenceRows()[0]).toMatchObject({
      status: "blocked",
      policy_decision: "requires_approval",
      approval_id: APPROVAL_VALID,
    });
  });

  it("rejects an approval bound to another project before any evidence or provider call", async () => {
    await expect(
      newHub().invoke({
        serverId: "github",
        toolName: "get_publish_status",
        projectId: PROJECT_SLUG,
        approvalId: APPROVAL_CROSS_PROJECT,
        arguments: {},
      }),
    ).rejects.toThrow(/does not belong to the requested project/);

    expect(providerMethods).toEqual([]);
    expect(evidenceRows()).toHaveLength(0);
  });

  it("rejects a denied approval at the provenance boundary, before any evidence or provider call", async () => {
    await expect(
      newHub().invoke({
        serverId: "github",
        toolName: "get_publish_status",
        projectId: PROJECT_SLUG,
        missionId: MISSION_OWN,
        approvalId: APPROVAL_REVOKED,
        arguments: {},
      }),
    ).rejects.toThrow(/is not approved/);

    expect(providerMethods).toEqual([]);
    expect(evidenceRows()).toHaveLength(0);
  });

  it("denies a write-implying tool when the server endpoint is not configured, with zero provider calls", async () => {
    await expect(
      newHub({}).invoke({
        serverId: "github",
        toolName: "get_publish_status",
        projectId: PROJECT_SLUG,
        arguments: {},
      }),
    ).rejects.toThrow(/MCP invocation blocked .*MCP_GITHUB_URL is not configured/);

    expect(providerMethods).toEqual([]);
  });
});
