import { describe, expect, it } from "vitest";
import { DEFAULT_MCP_SERVERS } from "./defaultRegistry.js";
import { evaluateMcpPolicy, matchesToolPattern } from "./policy.js";

const github = DEFAULT_MCP_SERVERS.find((server) => server.id === "github");
if (!github) throw new Error("GitHub MCP definition missing");

const configuredEnv = {
  NODE_ENV: "development",
  MCP_GITHUB_URL: "https://mcp.example.test/github",
} as NodeJS.ProcessEnv;

describe("MCP Phase 1 policy", () => {
  it("matches wildcard tool patterns", () => {
    expect(matchesToolPattern("search_code", "search_*")).toBe(true);
    expect(matchesToolPattern("create_issue", "search_*")).toBe(false);
  });

  it("allows an allowlisted read tool for an active project", () => {
    expect(
      evaluateMcpPolicy({
        server: github,
        projectId: "sekret-bip",
        toolName: "search_code",
        env: configuredEnv,
      }),
    ).toMatchObject({ decision: "allow", risk: "read" });
  });

  it("denies write tools even when the provider is configured", () => {
    expect(
      evaluateMcpPolicy({
        server: github,
        projectId: "sekret-bip",
        toolName: "create_pull_request",
        env: configuredEnv,
      }),
    ).toMatchObject({ decision: "deny" });
  });

  it("denies quarantined or unknown projects", () => {
    expect(
      evaluateMcpPolicy({
        server: github,
        projectId: "sekret-bip-demo",
        toolName: "search_code",
        env: configuredEnv,
      }),
    ).toMatchObject({ decision: "deny" });
  });

  it("fails closed when the endpoint is not configured", () => {
    expect(
      evaluateMcpPolicy({
        server: github,
        projectId: "sekret-bip",
        toolName: "search_code",
        env: { NODE_ENV: "development" },
      }),
    ).toMatchObject({ decision: "deny" });
  });

  it("disables development-only servers in production", () => {
    const supabase = DEFAULT_MCP_SERVERS.find(
      (server) => server.id === "supabase-dev",
    );
    if (!supabase) throw new Error("Supabase development MCP definition missing");

    expect(
      evaluateMcpPolicy({
        server: supabase,
        projectId: "founder-control-room",
        toolName: "list_tables",
        env: {
          NODE_ENV: "production",
          MCP_SUPABASE_DEV_URL: "https://mcp.example.test/supabase",
        },
      }),
    ).toMatchObject({ decision: "deny" });
  });
});
