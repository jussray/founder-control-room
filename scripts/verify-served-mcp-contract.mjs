#!/usr/bin/env node

/**
 * Served MCP surface contract — cross-file wiring the per-route contracts
 * don't cover.
 *
 * `verify:mcp` covers the outbound `.mcp.json` client configuration.
 * `verify-remote-read-mcp-config.mjs` (also under `verify:mcp`) already pins
 * `remoteReadMcp.ts` content, `.env.example`, `wrangler.worker.toml`, and
 * `docs/MCP_STACK.md` for the /mcp and /mcp/read lanes. This script does not
 * repeat that coverage. It pins three things nothing else does:
 *
 *   1. The tool catalog and evidence contract in `externalTools.ts` and the
 *      shared secret-argument guard in `safety.ts` — invoked by /mcp and
 *      /mcp/read but never asserted on directly.
 *   2. That every served MCP mount point (POST /mcp, POST /mcp/read,
 *      POST /mcp/founder-signal-engine, POST /mcp/founder-signal-x-engagement)
 *      still carries its middleware in `mcp.ts` and `server.ts`. A route file
 *      can keep every internal invariant intact while a mount edit silently
 *      drops the auth middleware in front of it; nothing else checks that.
 *   3. The served discovery/initialize description stays truthful about the
 *      seven read/preview tools plus the one bounded peer relay.
 *
 * Scope is deliberately narrow otherwise: it does not assert OAuth claim
 * handling or protocol-version literals. The external tool catalog is pinned
 * only where authority semantics matter: seven read/preview tools stay read-only,
 * while the one peer-operator relay is a bounded external side effect with no
 * repository/provider mutation authority.
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

const externalTools = read("src/mcp/externalTools.ts");
const safety = read("src/mcp/safety.ts");
const remoteReadMcp = read("src/http/routes/remoteReadMcp.ts");
const signalEngineMcp = read("src/http/routes/founderSignalEngineMcp.ts");
const xEngagementMcp = read("src/http/routes/xEngagementSignalMcp.ts");
const mcpRouter = read("src/http/routes/mcp.ts");
const server = read("src/http/server.ts");

/* ---------- externalTools.ts: the tool catalog invoked by /mcp and /mcp/read ---------- */

const toolDefsMatch = externalTools.match(
  /export function externalMcpToolDefinitions\(\)[\s\S]*?\n}\n/,
);
assert(toolDefsMatch, "externalMcpToolDefinitions is missing");
const toolDefsBody = toolDefsMatch[0];
assert(
  /const readAnnotations = \{[\s\S]{0,160}?readOnlyHint:\s*true/.test(toolDefsBody),
  "the shared read-tool annotation object must declare readOnlyHint: true",
);
assert(
  /const relayAnnotations = \{[\s\S]{0,200}?readOnlyHint:\s*false[\s\S]{0,160}?destructiveHint:\s*false[\s\S]{0,160}?idempotentHint:\s*false[\s\S]{0,160}?openWorldHint:\s*true/.test(toolDefsBody),
  "the peer relay annotation must truthfully declare a non-destructive external side effect",
);
const falseReadOnlyCount = (toolDefsBody.match(/readOnlyHint:\s*false/g) ?? []).length;
assert(
  falseReadOnlyCount === 1,
  `exactly one external MCP tool annotation may advertise readOnlyHint: false (found ${falseReadOnlyCount})`,
);
const toolCount = (toolDefsBody.match(/^\s{6}name:\s*'/gm) ?? []).length;
const readAnnotationUses = (
  toolDefsBody.match(/annotations:\s*(?:readAnnotations|\{\s*\.\.\.readAnnotations)/g) ?? []
).length;
const relayAnnotationUses = (toolDefsBody.match(/annotations:\s*relayAnnotations/g) ?? []).length;
assert(toolCount === 8, `external MCP catalog must contain the seven read/preview tools plus one relay tool (found ${toolCount})`);
assert(
  readAnnotationUses === 7,
  `exactly seven declared external MCP tools must derive from readAnnotations (found ${readAnnotationUses})`,
);
assert(
  relayAnnotationUses === 1 && /name:\s*'fcr_relay_operator'[\s\S]{0,1600}?annotations:\s*relayAnnotations/.test(toolDefsBody),
  "fcr_relay_operator must be the only tool using relayAnnotations",
);
assert(
  /name:\s*'github_audit_pr'[\s\S]{0,1600}?annotations:\s*\{\s*\.\.\.readAnnotations/.test(toolDefsBody),
  "github_audit_pr must stay on the read-only annotation path",
);
assert(
  externalTools.includes("executionAllowed: false") &&
    externalTools.includes("founderApprovalGranted: false"),
  "every external MCP tool result must declare no execution authority and no founder approval",
);
assert(
  externalTools.includes("throw new Error('Requested project is outside this remote MCP grant')"),
  "a project outside the caller's grant must be refused, not silently substituted",
);
assert(
  externalTools.includes("rawArgumentsStored: false") &&
    externalTools.includes("rawResultStored: false"),
  "evidence receipts must not retain raw tool arguments or raw tool results",
);

/* ---------- remoteReadMcp.ts: served description must match the actual catalog ---------- */

assert(
  remoteReadMcp.includes('seven read/preview tools plus one bounded peer-operator relay tool'),
  "modern server/discover must describe seven read/preview tools plus the bounded peer relay",
);
assert(
  remoteReadMcp.includes('Seven read/preview tools plus one bounded peer-operator relay'),
  "legacy initialize must describe seven read/preview tools plus the bounded peer relay",
);
assert(
  !remoteReadMcp.includes('six read/preview tools plus one bounded peer-operator relay tool') &&
    !remoteReadMcp.includes('Six read/preview tools plus one bounded peer-operator relay'),
  "served MCP must not regress to the stale six-read-tool catalog description",
);
assert(
  remoteReadMcp.includes('research/propose/review') &&
    remoteReadMcp.includes('carries no mutation authority'),
  "served MCP must state the peer relay capability and authority ceiling truthfully",
);

/* ---------- safety.ts: the shared secret-argument guard both MCP lanes call ---------- */

const secretPatternLine = safety.match(/const SECRET_KEY_PATTERN\s*=\s*\/[^\n]*\/[a-z]*/);
assert(secretPatternLine, "SECRET_KEY_PATTERN definition is missing from safety.ts");
for (const term of ["token", "secret", "password", "api[_-]?key", "service[_-]?role"]) {
  assert(
    secretPatternLine[0].includes(term),
    `SECRET_KEY_PATTERN must still cover the "${term}" shape`,
  );
}
assert(
  /export function assertNoSecretArguments\(/.test(safety),
  "assertNoSecretArguments must remain exported under its exact name for the served MCP lanes to use",
);

/* ---------- the two Founder Signal endpoints: no contract covers these yet ---------- */

assert(
  signalEngineMcp.includes("Runtime-populated authorization receipt") &&
    /Caller values are rejected upstream/.test(signalEngineMcp),
  "founder signal engine must keep founderApprovalId runtime-populated, never caller-supplied",
);
assert(
  signalEngineMcp.includes("standing-policy:"),
  "founder signal engine must mint publication authority from a server-held standing policy",
);
assert(
  /return timingSafeEqual\(actualBuffer, expectedBuffer\);/.test(xEngagementMcp),
  "x-engagement signal MCP must compare its bearer token with timingSafeEqual, not a fast-exit equality",
);

/* ---------- every served mount point still carries its middleware ---------- */

assert(
  /mcpRouter\.post\("\/", handlePairedRemoteMcp\)/.test(mcpRouter),
  "the canonical OAuth lane must remain mounted at POST /mcp",
);
assert(
  /mcpRouter\.post\("\/read", handleRemoteReadMcp\)/.test(mcpRouter),
  "the compatibility static-token lane must remain mounted at POST /mcp/read",
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

console.log(
  "[verify:served-mcp] Seven read/preview MCP tools, one bounded peer relay, truthful served discovery, secret-argument guard, "
    + "Founder Signal endpoints, and every served mount point's middleware wiring are pinned.",
);
