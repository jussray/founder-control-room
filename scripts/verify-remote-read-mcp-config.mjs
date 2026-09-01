#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
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
const remoteRoute = read('src/http/routes/remoteReadMcp.ts');
const mcpRouter = read('src/http/routes/mcp.ts');
const portfolio = read('src/config/portfolio.ts');
const activePortfolioSlugs = slugsFromConst(portfolio, 'PORTFOLIO_PROJECTS');
const externalPortfolioSlugs = slugsFromConst(portfolio, 'EXTERNAL_PROJECTS');
const exactRemoteScope = activePortfolioSlugs.join(',');

assert(activePortfolioSlugs.length > 0, 'active portfolio registry must be readable');
assert(
  externalPortfolioSlugs.every((slug) => !activePortfolioSlugs.includes(slug)),
  'external continuity-only projects must never overlap the active MCP authority registry',
);

assert(
  envExample.includes('FCR_REMOTE_MCP_READ_TOKEN='),
  '.env.example must declare the dedicated remote read MCP token name',
);
assert(
  envExample.includes(`FCR_REMOTE_MCP_READ_PROJECTS=${exactRemoteScope}`),
  `.env.example must document the active portfolio scope as ${exactRemoteScope}`,
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
  docs.includes(`FCR_REMOTE_MCP_READ_PROJECTS=${exactRemoteScope}`),
  'MCP stack docs must state the complete active-portfolio read scope',
);
assert(
  /fails closed/i.test(docs),
  'MCP stack docs must preserve the fail-closed operator boundary',
);

for (const requiredRemoteRouteFragment of [
  'export function createRemoteReadMcpHandler',
  'env.FCR_REMOTE_MCP_READ_TOKEN',
  'env.FCR_REMOTE_MCP_READ_PROJECTS',
  "const MODERN_PROTOCOL_VERSION = '2026-07-28'",
  "const SERVER_NAME = 'founder-control-room-paired'",
  'createExternalMcpToolExecutor',
  'isExternalMcpToolName',
  'verifyRemoteMcpOauthToken',
  'assertNoSecretArguments(args)',
  'timingSafeEqual',
  'intersectProjects(serverProjects, oauthIdentity.projectIds)',
]) {
  assert(
    remoteRoute.includes(requiredRemoteRouteFragment),
    `served remote MCP route contract drifted: missing ${requiredRemoteRouteFragment}`,
  );
}

for (const requiredMcpRouterFragment of [
  'PORTFOLIO_PROJECTS',
  '.map((project) => project.slug)',
  '.join(",")',
  '...process.env',
  'FCR_REMOTE_MCP_READ_PROJECTS: portfolioRemoteReadScope',
  'createRemoteReadMcpHandler({',
  'authMode: "oauth"',
  'authMode: "static"',
  'env: portfolioRemoteMcpEnv',
]) {
  assert(
    mcpRouter.includes(requiredMcpRouterFragment),
    `MCP router must derive server scope from PORTFOLIO_PROJECTS: missing ${requiredMcpRouterFragment}`,
  );
}

assert(
  !mcpRouter.includes('handlePairedRemoteMcp,') && !mcpRouter.includes('handleRemoteReadMcp,'),
  'MCP router must not import pre-instantiated handlers that can bypass the registry-derived server scope',
);
assert(
  mcpRouter.indexOf('...process.env') < mcpRouter.indexOf('FCR_REMOTE_MCP_READ_PROJECTS: portfolioRemoteReadScope'),
  'registry-derived scope must override provider/runtime environment values rather than be overridden by them',
);
assert(
  !remoteRoute.includes("'create_tool'")
    && !remoteRoute.includes("'write_tool'")
    && !remoteRoute.includes("'merge_tool'"),
  'served MCP route may not advertise write-shaped tools',
);

console.log(
  `[verify:remote-read-mcp] registry-derived active scope (${exactRemoteScope}), external-project exclusion, OAuth intersection, static-token compatibility, secret rejection, and read/preview-only routing are pinned.`,
);
