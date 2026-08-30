#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const EXACT_REMOTE_SCOPE = 'sekret-bip,juss-beautiful-hair,jbh-private,l99,chief-ai-machine,untold-stories,founder-control-room,promptos';
const REMOTE_ENDPOINT = 'POST https://api.foundercontrolroom.org/mcp/read';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`[verify:remote-read-mcp] ${message}`);
}

function slugsFromConst(source, constName) {
  const match = source.match(new RegExp(`export const ${constName}:[\\s\\S]*?\\] as const;`));
  if (!match) return [];
  return [...match[0].matchAll(/slug:\s*"([^"]+)"/g)].map((entry) => entry[1]);
}

const envExample = read('.env.example');
const wrangler = read('wrangler.worker.toml');
const docs = read('docs/MCP_STACK.md');
const route = read('src/http/routes/remoteReadMcp.ts');
const portfolio = read('src/config/portfolio.ts');
const activePortfolioSlugs = slugsFromConst(portfolio, 'PORTFOLIO_PROJECTS');
const externalPortfolioSlugs = slugsFromConst(portfolio, 'EXTERNAL_PROJECTS');
const remoteScopeSlugs = EXACT_REMOTE_SCOPE.split(',');

assert(activePortfolioSlugs.length > 0, 'active portfolio registry must be readable');
assert(
  JSON.stringify(remoteScopeSlugs) === JSON.stringify(activePortfolioSlugs),
  `remote read scope must exactly mirror PORTFOLIO_PROJECTS order; expected ${activePortfolioSlugs.join(',')}`,
);
assert(
  externalPortfolioSlugs.every((slug) => !remoteScopeSlugs.includes(slug)),
  'external continuity-only projects must never inherit remote MCP authority',
);

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
  'MCP stack docs must state the exact server-held active-portfolio scope',
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
  '[verify:remote-read-mcp] static compatibility auth, paired OAuth auth, exact active-portfolio scope, external-project exclusion, secret rejection, and read/preview-only tool routing are pinned.',
);
