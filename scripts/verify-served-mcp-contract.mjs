#!/usr/bin/env node

/**
 * Served MCP surface contract.
 *
 * Founder Control Room is an MCP server, not only an MCP client. `verify:mcp`
 * covers the outbound `.mcp.json` client configuration; this contract covers
 * the three endpoints FCR serves, which previously had no verification gate.
 *
 * It pins the properties that keep the served surface safe: fail-closed
 * configuration, constant-time bearer comparison, server-held project scope,
 * read-only refusal behavior, middleware wiring at the mount point, and the
 * rule that authority-bearing identifiers are runtime-populated rather than
 * caller-supplied.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`[verify:served-mcp] ${message}`);
}

const remoteRead = read("src/http/routes/remoteReadMcp.ts");
const signalEngine = read("src/http/routes/founderSignalEngineMcp.ts");
const xEngagement = read("src/http/routes/xEngagementSignalMcp.ts");
const mcpRouter = read("src/http/routes/mcp.ts");
const server = read("src/http/server.ts");
const envExample = read(".env.example");
const mcpStack = read("docs/MCP_STACK.md");

const PROTOCOL_VERSION = "2025-06-18";

/* ---------- protocol identity ---------- */

for (const [name, source] of [
  ["remoteReadMcp.ts", remoteRead],
  ["founderSignalEngineMcp.ts", signalEngine],
  ["xEngagementSignalMcp.ts", xEngagement],
]) {
  assert(
    source.includes(`const MCP_PROTOCOL_VERSION = '${PROTOCOL_VERSION}'`),
    `${name} must pin MCP protocol version ${PROTOCOL_VERSION}`,
  );
}

/* ---------- /mcp/read: fail closed, constant time, server-held scope ---------- */

assert(
  remoteRead.includes("FCR_REMOTE_MCP_READ_TOKEN") &&
    remoteRead.includes("FCR_REMOTE_MCP_READ_PROJECTS"),
  "remote read MCP must read both its token and its project-scope variable",
);
assert(
  /if \(!configuredToken \|\| allowedProjects\.size === 0\)[\s\S]{0,200}?res\.status\(503\)/.test(
    remoteRead,
  ),
  "remote read MCP must fail closed with 503 when token or project scope is unconfigured",
);
assert(
  remoteRead.includes("timingSafeEqual"),
  "remote read MCP must compare bearer tokens in constant time",
);
assert(
  /secureEqual\(token, configuredToken\)/.test(remoteRead),
  "remote read MCP must authenticate through the constant-time comparison helper",
);
assert(
  /if \(!allowedProjects\.has\(projectId\)\)[\s\S]{0,200}?res\.status\(403\)/.test(remoteRead),
  "remote read MCP must refuse a project outside the server-held grant with 403",
);
assert(
  remoteRead.includes("assertNoSecretArguments"),
  "remote read MCP must reject secret-shaped tool arguments",
);
assert(
  /policy\.decision !== 'allow' \|\| result\.policy\.risk !== 'read'/.test(remoteRead),
  "remote read MCP must refuse any non-read policy result before returning provider output",
);

// Project scope must fail closed on a malformed entry rather than defaulting open.
assert(
  /projects\.length === 0 \|\| projects\.some\(\(project\) => !PROJECT_SLUG\.test\(project\)\)/.test(
    remoteRead,
  ),
  "remote read MCP project scope must reject an empty or malformed list instead of widening",
);

// Both advertised tools must declare themselves read-only.
const readOnlyHints = remoteRead.match(/readOnlyHint:\s*true/g) ?? [];
assert(
  readOnlyHints.length >= 2,
  "both remote read MCP tools must advertise readOnlyHint: true",
);
assert(
  !/readOnlyHint:\s*false/.test(remoteRead),
  "remote read MCP must not advertise a write-capable tool",
);

/* ---------- signal engine: authority is runtime-populated, never caller-supplied ---------- */

assert(
  /founderApprovalId[\s\S]{0,400}?Runtime-populated authorization receipt\. Caller values are rejected upstream\./.test(
    signalEngine,
  ),
  "founder signal engine must document founderApprovalId as runtime-populated and caller-rejected",
);
assert(
  signalEngine.includes("standing-policy:"),
  "founder signal engine must mint publication authority from the server-held standing policy",
);
assert(
  /additionalProperties:\s*false/.test(signalEngine),
  "founder signal engine tool schema must reject unexpected arguments",
);

/* ---------- mount points carry their middleware ---------- */

assert(
  /mcpRouter\.post\("\/read", handleRemoteReadMcp\)/.test(mcpRouter),
  "/mcp/read must remain mounted on the MCP router",
);
assert(
  /app\.use\('\/mcp', mcpRouter\)/.test(server),
  "the MCP router must remain mounted at /mcp",
);

const signalEngineMount = server.match(
  /app\.post\(\s*'\/mcp\/founder-signal-engine',[\s\S]{0,400}?\);/,
);
assert(signalEngineMount, "/mcp/founder-signal-engine mount is missing");
assert(
  signalEngineMount[0].includes("requireFounderSignalEngineMcpToken") &&
    signalEngineMount[0].includes("requireFounderSignalEngineReviewOnly") &&
    signalEngineMount[0].includes("handleFounderSignalEngineMcp"),
  "/mcp/founder-signal-engine must keep both its token and review-only middleware",
);

const xEngagementMount = server.match(
  /app\.post\(\s*'\/mcp\/founder-signal-x-engagement',[\s\S]{0,400}?\);/,
);
assert(xEngagementMount, "/mcp/founder-signal-x-engagement mount is missing");
assert(
  xEngagementMount[0].includes("requireFounderSignalReadMcpToken") &&
    xEngagementMount[0].includes("handleXEngagementSignalMcp"),
  "/mcp/founder-signal-x-engagement must keep its read-token middleware",
);

/* ---------- the served surface stays documented ---------- */

assert(
  envExample.includes("FCR_REMOTE_MCP_READ_TOKEN=") &&
    envExample.includes("FCR_REMOTE_MCP_READ_PROJECTS="),
  ".env.example must document both /mcp/read configuration variables",
);
assert(
  mcpStack.includes("/mcp/read") &&
    mcpStack.includes("/mcp/founder-signal-engine") &&
    mcpStack.includes("/mcp/founder-signal-x-engagement"),
  "docs/MCP_STACK.md must document all three served MCP endpoints",
);

console.log(
  "[verify:served-mcp] Served MCP endpoints are fail-closed, constant-time authenticated, scope-bound, read-annotated, middleware-wired, and documented.",
);
