import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const expectedServerNames = [
  'cloudflare-builds',
  'cloudflare-docs',
  'cloudflare-observability',
  'context7',
  'figma',
  'github',
  'supabase',
];

const expectedRemoteUrls = {
  github: 'https://api.githubcopilot.com/mcp/',
  context7: 'https://mcp.context7.com/mcp',
  figma: 'https://mcp.figma.com/mcp',
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

  assert(!servers.figma?.headers, `${relativePath}:figma must authenticate through the supported client`);
  assert(!servers.figma?.env, `${relativePath}:figma must not commit environment credentials`);
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
    /FIGMA_API_KEY/,
    /FIGMA_ACCESS_TOKEN/,
  ];
  for (const pattern of patterns) {
    assert(!pattern.test(serialized), `${relativePath} appears to contain a committed credential`);
  }
}

function validateSkillRouting(routing) {
  assert(routing?.schemaVersion === 1, 'config/mcp-skill-routing.json schemaVersion must be 1');
  assert(
    Array.isArray(routing.alwaysLoad) && routing.alwaysLoad.includes('control-room-repo-contract'),
    'MCP routing must always load control-room-repo-contract',
  );

  const routedServers = routing.servers ?? {};
  assert(
    JSON.stringify(Object.keys(routedServers).sort()) === JSON.stringify(expectedServerNames),
    'MCP skill routing must cover every configured server exactly once',
  );

  const allSkills = new Set(routing.alwaysLoad);
  for (const [serverName, route] of Object.entries(routedServers)) {
    assert(Array.isArray(route.skills) && route.skills.length > 0, `${serverName} must load at least one skill`);
    assert(typeof route.boundary === 'string' && route.boundary.length >= 24, `${serverName} boundary is missing or too weak`);
    for (const skill of route.skills) allSkills.add(skill);
  }

  const figmaSkills = routedServers.figma?.skills ?? [];
  for (const required of [
    'control-room-repo-contract',
    'control-room-figma-builder',
    'control-room-design-implementation',
  ]) {
    assert(figmaSkills.includes(required), `figma routing must include ${required}`);
  }

  for (const skill of allSkills) {
    const skillPath = path.join(root, '.agents', 'skills', skill, 'SKILL.md');
    assert(fs.existsSync(skillPath), `mapped skill is missing: .agents/skills/${skill}/SKILL.md`);
  }

  const figmaSource = path.join(root, 'docs', 'FIGMA_SOURCE_OF_TRUTH.md');
  assert(fs.existsSync(figmaSource), 'docs/FIGMA_SOURCE_OF_TRUTH.md must exist while Figma is enabled');
}

const projectConfig = readJson('.mcp.json');
const exampleConfig = readJson('.mcp.example.json');
const vscodeConfig = readJson('.vscode/mcp.json');
const skillRouting = readJson('config/mcp-skill-routing.json');

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
validateSkillRouting(skillRouting);

for (const [relativePath, parsed] of [
  ['.mcp.json', projectConfig],
  ['.mcp.example.json', exampleConfig],
  ['.vscode/mcp.json', vscodeConfig],
]) {
  assertNoCommittedSecrets(relativePath, parsed);
  const servers = parsed.mcpServers ?? parsed.servers;
  for (const forbidden of ['playwright', 'dbhub', 'netdata-cloud']) {
    assert(!servers[forbidden], `${relativePath}:${forbidden} is not justified in the current Control Room phase`);
  }
  assert(
    !String(servers.supabase?.url ?? '').includes('tbsevonvegdnlyjgplmm'),
    `${relativePath}:Control Room must never point its standing MCP config at Bip's Supabase project`,
  );
}

console.log('[verify:mcp] Control Room MCP configuration and skill routing are scoped, credential-free, and repository-bound.');