#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`[verify:cloudflare-mcp-read] ${message}`);
}

const probe = read("scripts/probe-cloudflare-api-mcp.mjs");
const workflow = read(".github/workflows/cloudflare-mcp-read-diagnostic.yml");
const registry = read("src/mcp/defaultRegistry.ts");
const secrets = read("docs/SECRETS.md");

assert(
  probe.includes('"https://mcp.cloudflare.com/mcp"'),
  "probe must remain pinned to the official Cloudflare API MCP endpoint",
);
assert(
  probe.includes('url.hostname !== "mcp.cloudflare.com"') &&
    probe.includes('url.pathname !== "/mcp"'),
  "probe must reject endpoint host/path drift",
);
assert(
  !probe.includes("CF_MCP_EXECUTE_CODE") && !probe.includes("CF_MCP_REQUEST_METHOD"),
  "probe must not accept externally supplied execute code or HTTP methods",
);

const executeCode = probe.match(/const code = `([\s\S]*?)`;\n\n  const executeResult/);
assert(executeCode, "probe fixed execute code block is missing");
assert(/method:\s*"GET"/.test(executeCode[1]), "provider witness must remain GET-only");
assert(
  !/method:\s*"(?:POST|PUT|PATCH|DELETE)"/i.test(executeCode[1]),
  "provider witness may not contain a mutation HTTP method",
);
assert(
  executeCode[1].includes('path: "/accounts/${safeAccountId}"'),
  "provider witness must remain scoped to exact account details",
);

assert(workflow.includes("workflow_dispatch:"), "diagnostic must remain manual-only");
assert(workflow.includes("environment: production"), "diagnostic must remain production-environment scoped");
assert(
  workflow.includes("secrets.FCR_CLOUDFLARE_MCP_READ_TOKEN"),
  "diagnostic must use the dedicated MCP read token",
);
assert(
  workflow.includes('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"'),
  "diagnostic must fail closed unless the approved SHA is current main",
);
assert(
  workflow.includes("node scripts/probe-cloudflare-api-mcp.mjs"),
  "diagnostic must execute the repository-owned probe",
);

assert(registry.includes('id: "cloudflare-api"'), "runtime registry must expose official Cloudflare API MCP");
assert(
  registry.includes('endpointEnv: "MCP_CLOUDFLARE_API_URL"') &&
    registry.includes('authTokenEnv: "FCR_CLOUDFLARE_MCP_READ_TOKEN"'),
  "runtime Cloudflare API MCP authority bindings drifted",
);
assert(
  registry.includes('allowedToolPatterns: ["search"]') &&
    registry.includes('deniedToolPatterns: ["execute"]'),
  "normal Control Room MCP policy must keep execute denied",
);
assert(
  !registry.includes('id: "cloudflare-stack"'),
  "undocumented Cloudflare Stack endpoint may not become runtime provider authority",
);
assert(
  secrets.includes("`FCR_CLOUDFLARE_MCP_READ_TOKEN`"),
  "secret registry must document the dedicated MCP read credential",
);

console.log(
  "[verify:cloudflare-mcp-read] official endpoint, exact-head workflow, GET-only witness, dedicated credential, and fail-closed runtime policy are pinned.",
);
