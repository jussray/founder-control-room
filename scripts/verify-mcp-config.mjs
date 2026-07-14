import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const expectedServerNames = [
  'cloudflare-builds',
  'cloudflare-docs',
  'cloudflare-observability',
  'context7',
  'github',
  'supabase',
];

const expectedRemoteUrls = {
  github: 'https://api.githubcopilot.com/mcp/',
  context7: 'https://mcp.context7.com/mcp',
  'cloudflare-docs': 'https://docs.mcp.cloudflare.com/mcp',
  'cloudflare-builds': 'https://builds.mcp.cloudflare.com/mcp',
  'cloudflare-observability': 'https://observability.mcp.cloudflare.com/mcp',
};

const expectedGithubToolsets =
  'repos,issues,pull_requests,actions,code_security,secret_protection';

function fail(message) {
  throw new Error(`[verify:mcp] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath} is missing or invalid JSON: ${error.message}`);
  }
}

function validateServerSet(relativePath, servers) {
  assert(
    JSON.stringify(Object.keys(servers ?? {}).sort()) === JSON.stringify(expectedServerNames),
    `${relativePath} must contain exactly: ${expectedServerNames.join(', ')}`,
  );
}

function validateRemoteServers(relativePath, servers) {
  for (const [name, url] of Object.entries(expectedRemoteUrls)) {
    assert(servers[name]?.type === 'http', `${relativePath}:${name} must use HTTP`);
    assert(servers[name]?.url === url, `${relativePath}:${name} URL drifted`);
  }

  const githubHeaders = servers.github?.headers ?? {};
  assert(
    githubHeaders['X-MCP-Toolsets'] === expectedGithubToolsets,
    `${relativePath}:github toolsets drifted`,
  );
  assert(!githubHeaders.Authorization, `${relativePath}:GitHub Authorization headers must not be committed`);
  assert(
    githubHeaders['X-MCP-Insiders'] !== 'true',
    `${relativePath}:GitHub Insiders is private opt-in only`,
  );
}

function validateSupabase(relativePath, server, expectedProjectRef) {
  const url = new URL(server?.url ?? '');
  assert(server?.type === 'http', `${relativePath}:supabase must use HTTP`);
  assert(url.origin === 'https://mcp.supabase.com', `${relativePath}:supabase host drifted`);
  assert(url.pathname === '/mcp', `${relativePath}:supabase path drifted`);
  assert(
    url.searchParams.get('project_ref') === expectedProjectRef,
    `${relativePath}:supabase project scope drifted`,
  );
  assert(url.searchParams.get('read_only') === 'true', `${relativePath}:supabase must remain read-only`);
  assert(
    url.searchParams.get('features') === 'database,docs',
    `${relativePath}:supabase features must remain database,docs`,
  );
}

function assertNoCommittedSecrets(relativePath, parsed) {
  const serialized = JSON.stringify(parsed);
  const patterns = [
    /github_pat_/i,
    /ghp_[A-Za-z0-9]{20,}/,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
    /Bearer\s+[A-Za-z0-9._-]{12,}/i,
    /SUPABASE_SERVICE_ROLE_KEY/,
    /CLOUDFLARE_API_TOKEN/,
  ];
  for (const pattern of patterns) {
    assert(!pattern.test(serialized), `${relativePath} appears to contain a committed credential`);
  }
}

const projectConfig = readJson('.mcp.json');
const exampleConfig = readJson('.mcp.example.json');
const vscodeConfig = readJson('.vscode/mcp.json');

const projectServers = projectConfig.mcpServers;
const exampleServers = exampleConfig.mcpServers;
const vscodeServers = vscodeConfig.servers;

validateServerSet('.mcp.json', projectServers);
validateServerSet('.mcp.example.json', exampleServers);
validateServerSet('.vscode/mcp.json', vscodeServers);

validateRemoteServers('.mcp.json', projectServers);
validateRemoteServers('.mcp.example.json', exampleServers);
validateRemoteServers('.vscode/mcp.json', vscodeServers);

validateSupabase('.mcp.json', projectServers.supabase, 'oojzfmmywbvficgybaxd');
validateSupabase('.mcp.example.json', exampleServers.supabase, 'YOUR_CONTROL_ROOM_PROJECT_REF');
validateSupabase('.vscode/mcp.json', vscodeServers.supabase, 'oojzfmmywbvficgybaxd');

for (const [relativePath, parsed] of [
  ['.mcp.json', projectConfig],
  ['.mcp.example.json', exampleConfig],
  ['.vscode/mcp.json', vscodeConfig],
]) {
  assertNoCommittedSecrets(relativePath, parsed);
  const servers = parsed.mcpServers ?? parsed.servers;
  for (const forbidden of ['playwright', 'figma', 'dbhub', 'netdata-cloud']) {
    assert(!servers[forbidden], `${relativePath}:${forbidden} is not justified in the current Control Room phase`);
  }
  assert(
    !String(servers.supabase?.url ?? '').includes('tbsevonvegdnlyjgplmm'),
    `${relativePath}:Control Room must never point its standing MCP config at Bip's Supabase project`,
  );
}

console.log('[verify:mcp] Control Room MCP configuration is scoped, read-only, and credential-free.');
