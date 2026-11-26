import { describe, expect, it } from "vitest";
import { DEFAULT_MCP_SERVERS } from "../defaultRegistry.js";
import { evaluateMcpPolicy } from "../policy.js";

const obsidian = DEFAULT_MCP_SERVERS.find(
  (server) => server.id === "obsidian-approved-knowledge",
);
if (!obsidian) throw new Error("Obsidian approved-knowledge MCP is not registered");

const LOCAL_URL = "http://127.0.0.1:8789/mcp";
const env = {
  NODE_ENV: "development",
  MCP_OBSIDIAN_BRAIN_URL: LOCAL_URL,
  JUSS_BRAIN_READ_TOKEN: "test-only-" + "x".repeat(48),
} as NodeJS.ProcessEnv;

function decision(
  toolName = "search_approved_knowledge",
  options: { projectId?: string; env?: NodeJS.ProcessEnv } = {},
) {
  return evaluateMcpPolicy({
    server: obsidian!,
    projectId: options.projectId ?? "founder-control-room",
    toolName,
    env: options.env ?? env,
  }).decision;
}

describe("Obsidian approved-knowledge boundary (local, opt-in, read-only)", () => {
  it("uses a server-held secret configuration, with no default endpoint", () => {
    expect(obsidian?.endpointEnv).toBe("MCP_OBSIDIAN_BRAIN_URL");
    expect(obsidian?.authTokenEnv).toBe("JUSS_BRAIN_READ_TOKEN");
    expect(obsidian?.defaultRisk).toBe("read");
    expect(obsidian?.developmentOnly).toBe(true);
    expect(decision("search_approved_knowledge", {
      env: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
    })).toBe("deny");
    expect(decision("search_approved_knowledge", {
      env: { ...env, JUSS_BRAIN_READ_TOKEN: "" },
    })).toBe("deny");
    expect(decision("search_approved_knowledge", {
      env: { ...env, JUSS_BRAIN_READ_TOKEN: "short" },
    })).toBe("deny");
  });

  it("allows only named read tools for explicitly enabled active projects", () => {
    expect(obsidian?.enabledProjects).toEqual([
      "founder-control-room", "chief-ai-machine", "promptos",
    ]);
    for (const projectId of obsidian!.enabledProjects) {
      expect(decision("search_approved_knowledge", { projectId })).toBe("allow");
      expect(decision("get_approved_knowledge", { projectId })).toBe("allow");
    }
    expect(decision("search_approved_knowledge", {
      projectId: "truth-weaver",
    })).toBe("deny");
    expect(decision("search_approved_knowledge", {
      projectId: "sekret-bip",
    })).toBe("deny");
  });

  it("rejects mutation, publication, and execution capabilities", () => {
    for (const toolName of [
      "approve_knowledge", "delete_note", "publish_note", "deploy_agent",
      "write_memory", "read_private_memory", "list_vault_files",
    ]) {
      expect(decision(toolName)).not.toBe("allow");
    }
  });

  it("rejects production, test, and unspecified runtime modes", () => {
    for (const mode of ["production", "test", undefined]) {
      expect(decision("get_approved_knowledge", {
        env: { ...env, NODE_ENV: mode },
      })).toBe("deny");
    }
  });

  it("rejects remote, deceptive, or noncanonical endpoint configurations", () => {
    for (const url of [
      "https://brain.example.test/mcp",
      "http://127.0.0.2:8789/mcp",
      "http://localhost:8789/mcp",
      "http://127.0.0.1:8789/mcp/",
      "http://127.0.0.1:8789/mcp?debug=1",
      "http://127.0.0.1:8789/mcp#fragment",
      "http://127.0.0.1:9999/mcp",
      "http://user:pass@127.0.0.1:8789/mcp",
      "file:///tmp/brain",
    ]) {
      expect(decision("search_approved_knowledge", {
        env: { ...env, MCP_OBSIDIAN_BRAIN_URL: url },
      })).toBe("deny");
    }
  });
});
