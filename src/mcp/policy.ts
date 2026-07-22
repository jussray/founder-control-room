import { ACTIVE_PROJECT_SLUGS } from "../config/portfolio.js";
import type {
  McpPolicyResult,
  McpRisk,
  McpServerDefinition,
} from "./types.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesToolPattern(toolName: string, pattern: string): boolean {
  const regex = new RegExp(
    `^${pattern.split("*").map(escapeRegExp).join(".*")}$`,
    "i",
  );
  return regex.test(toolName);
}

const DESTRUCTIVE_WORDS = new Set([
  "delete",
  "destroy",
  "drop",
  "purge",
  "remove",
  "rollback",
  "revoke",
]);
const WRITE_WORDS = new Set([
  "create",
  "update",
  "write",
  "commit",
  "merge",
  "push",
  "publish",
  "deploy",
  "apply",
  "approve",
  "submit",
  "close",
  "reopen",
  "dispatch",
  "rerun",
  "cancel",
  "upload",
  "fill",
  "type",
  "click",
  "navigate",
]);

function toolNameTokens(toolName: string): string[] {
  return toolName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function inferToolRisk(toolName: string, fallback: McpRisk): McpRisk {
  const tokens = toolNameTokens(toolName);
  if (tokens.some((word) => DESTRUCTIVE_WORDS.has(word))) {
    return "destructive";
  }
  if (tokens.some((word) => WRITE_WORDS.has(word))) {
    return "write";
  }
  return fallback;
}

export function evaluateMcpPolicy(options: {
  server: McpServerDefinition;
  projectId: string;
  toolName: string;
  env?: NodeJS.ProcessEnv;
}): McpPolicyResult {
  const { server, projectId, toolName } = options;
  const env = options.env ?? process.env;
  const risk = inferToolRisk(toolName, server.defaultRisk);

  if (!ACTIVE_PROJECT_SLUGS.has(projectId)) {
    return {
      decision: "deny",
      risk,
      reason: "Project is not in the active portfolio registry.",
    };
  }
  if (!server.enabledProjects.includes(projectId)) {
    return {
      decision: "deny",
      risk,
      reason: "Server is not enabled for this project.",
    };
  }
  if (!env[server.endpointEnv]?.trim()) {
    return {
      decision: "deny",
      risk,
      reason: `Server endpoint ${server.endpointEnv} is not configured.`,
    };
  }
  if (server.developmentOnly && env.NODE_ENV === "production") {
    return {
      decision: "deny",
      risk,
      reason: "Development-only MCP server is disabled in production.",
    };
  }
  if (server.monthlyBudgetUsd > 0) {
    return {
      decision: "requires_approval",
      risk,
      reason: "Paid MCP capability requires explicit founder approval.",
    };
  }
  if (
    server.deniedToolPatterns.some((pattern) =>
      matchesToolPattern(toolName, pattern),
    )
  ) {
    return {
      decision: "deny",
      risk,
      reason: "Tool is explicitly denied by the server policy.",
    };
  }
  if (
    !server.allowedToolPatterns.some((pattern) =>
      matchesToolPattern(toolName, pattern),
    )
  ) {
    return {
      decision: "deny",
      risk,
      reason: "Tool is not on the Phase 1 allowlist.",
    };
  }
  if (risk !== "read") {
    return {
      decision: "requires_approval",
      risk,
      reason: "Phase 1 invokes read-only tools; mutations require a separately approved mission.",
    };
  }

  return {
    decision: "allow",
    risk,
    reason: "Read-only tool is allowed for this active project.",
  };
}
