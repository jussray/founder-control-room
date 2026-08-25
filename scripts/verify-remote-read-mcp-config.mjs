#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const EXACT_REMOTE_SCOPE = 'chief-ai-machine,founder-control-room';
const REMOTE_ENDPOINT = 'POST https://api.foundercontrolroom.org/mcp/read';
const EXPECTED_EXTERNAL_READ_TOOLS = [
  'chief_audit_repository',
  'chief_list_capabilities',
  'chief_preview_capability_plan',
  'fcr_list_projects',
  'fcr_get_current_truth',
  'fcr_preview_skill_route',
].sort();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`[verify:remote-read-mcp] ${message}`);
}

const envExample = read('.env.example');
const wrangler = read('wrangler.worker.toml');
const docs = read('docs/MCP_STACK.md');
const route = read('src/http/routes/remoteReadMcp.ts');
const externalTools = read('src/mcp/externalTools.ts');

assert(
  envExample.includes('FCR_REMOTE_MCP_READ_TOKEN='),
  '.env.example must declare the dedicated remote read MCP token name',
);
assert(
  envExample.includes(`FCR_REMOTE_MCP_READ_PROJECTS=${EXACT_REMOTE_SCOPE}`),
  `.env.example must keep the served remote read scope exactly ${EXACT_REMOTE_SCOPE}`,
);

assert(
  wrangler.includes(`FCR_REMOTE_MCP_READ_PROJECTS = "${EXACT_REMOTE_SCOPE}"`),
  `Worker production vars must keep remote read scope exactly ${EXACT_REMOTE_SCOPE}`,
);
assert(
  /required\s*=\s*\[[\s\S]*?"FCR_REMOTE_MCP_READ_TOKEN"[\s\S]*?\]/m.test(wrangler),
  'Worker required secrets must include FCR_REMOTE_MCP_READ_TOKEN',
);
assert(
  !/FCR_REMOTE_MCP_READ_TOKEN\s*=\s*"[^"\s]+"/.test(wrangler),
  'Worker config must never commit the remote read MCP token value',
);

assert(
  docs.includes(REMOTE_ENDPOINT),
  `MCP stack docs must identify the served endpoint as ${REMOTE_ENDPOINT}`,
);
assert(
  docs.includes(`FCR_REMOTE_MCP_READ_PROJECTS=${EXACT_REMOTE_SCOPE}`),
  'MCP stack docs must state the exact server-held two-project scope',
);
assert(
  /fails closed/i.test(docs),
  'MCP stack docs must preserve the fail-closed operator boundary',
);

for (const requiredRouteFragment of [
  'env.FCR_REMOTE_MCP_READ_TOKEN',
  'env.FCR_REMOTE_MCP_READ_PROJECTS',
  'externalMcpToolDefinitions',
  'isExternalMcpToolName',
  'timingSafeEqual',
  'Remote MCP project scope is not configured',
  "authMode === 'oauth'",
]) {
  assert(
    route.includes(requiredRouteFragment),
    `served remote read route contract drifted: missing ${requiredRouteFragment}`,
  );
}

const toolRegistryMatch = externalTools.match(
  /export const EXTERNAL_MCP_TOOL_NAMES = \[([\s\S]*?)\] as const;/m,
);
assert(toolRegistryMatch, 'external MCP tool registry declaration is missing');
const registeredTools = [...toolRegistryMatch[1].matchAll(/'([^']+)'/g)]
  .map((match) => match[1])
  .sort();
assert(
  JSON.stringify(registeredTools) === JSON.stringify(EXPECTED_EXTERNAL_READ_TOOLS),
  `external MCP read-only registry drifted: expected ${EXPECTED_EXTERNAL_READ_TOOLS.join(', ')}; got ${registeredTools.join(', ')}`,
);

for (const forbidden of ['create_tool', 'write_tool', 'merge_tool']) {
  assert(
    !route.includes(`'${forbidden}'`) && !externalTools.includes(`'${forbidden}'`),
    `served remote read surface may not advertise write-shaped tool ${forbidden}`,
  );
}

console.log(
  '[verify:remote-read-mcp] endpoint, exact two-project scope, dedicated secret, fail-closed auth, and registry-backed read-only tool surface are pinned.',
);
