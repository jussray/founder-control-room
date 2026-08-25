#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const EXACT_REMOTE_SCOPE = 'chief-ai-machine,founder-control-room';
const REMOTE_ENDPOINT = 'POST https://api.foundercontrolroom.org/mcp/read';

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
  `MCP stack docs must identify the compatibility endpoint as ${REMOTE_ENDPOINT}`,
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
  "const MODERN_PROTOCOL_VERSION = '2026-07-28'",
  "const SERVER_NAME = 'founder-control-room-paired'",
  'createExternalMcpToolExecutor',
  'isExternalMcpToolName',
  'verifyRemoteMcpOauthToken',
  'assertNoSecretArguments(args)',
  "createRemoteReadMcpHandler({ authMode: 'static' })",
  "createRemoteReadMcpHandler({ authMode: 'oauth' })",
  'timingSafeEqual',
]) {
  assert(
    route.includes(requiredRouteFragment),
    `served remote read route contract drifted: missing ${requiredRouteFragment}`,
  );
}

assert(
  !route.includes("'create_tool'") && !route.includes("'write_tool'") && !route.includes("'merge_tool'"),
  'served MCP route may not advertise write-shaped tools',
);

console.log(
  '[verify:remote-read-mcp] static compatibility auth, paired OAuth auth, exact project scope, secret rejection, and read/preview-only tool routing are pinned.',
);
