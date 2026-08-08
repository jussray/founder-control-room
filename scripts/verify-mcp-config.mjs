import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const expectedServerNames = [
  'cloudflare',
  'cloudflare-bindings',
  'cloudflare-builds',
  'cloudflare-docs',
  'cloudflare-observability',
  'context7',
  'figma',
  'github',
  'playwright',
  'supabase',
];
const expectedCloudflareServerNames = [
  'cloudflare',
  'cloudflare-bindings',
  'cloudflare-builds',
  'cloudflare-docs',
  'cloudflare-observability',
];

const expectedRemoteUrls = {
  github: 'https://api.githubcopilot.com/mcp/',
  context7: 'https://mcp.context7.com/mcp',
  figma: 'https://mcp.figma.com/mcp',
  cloudflare: 'https://mcp.cloudflare.com/mcp',
  'cloudflare-docs': 'https://docs.mcp.cloudflare.com/mcp',
  'cloudflare-bindings': 'https://bindings.mcp.cloudflare.com/mcp',
  'cloudflare-builds': 'https://builds.mcp.cloudflare.com/mcp',
  'cloudflare-observability': 'https://observability.mcp.cloudflare.com/mcp',
};

const expectedGithubToolsets =
  'repos,issues,pull_requests,actions,code_security,secret_protection';
const expectedPlaywrightArgs = ['-y', '@playwright/mcp@latest'];

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

function validateCloudflareServerSet(relativePath, servers) {
  assert(
    JSON.stringify(Object.keys(servers ?? {}).sort()) === JSON.stringify(expectedCloudflareServerNames),
    `${relativePath} must contain exactly the Cloudflare fleet: ${expectedCloudflareServerNames.join(', ')}`,
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

function validatePlaywright(relativePath, server, expectedType, requireTools) {
  assert(server?.type === expectedType, `${relativePath}:playwright must use ${expectedType}`);
  assert(server?.command === 'npx', `${relativePath}:playwright command must remain npx`);
  assert(
    JSON.stringify(server?.args ?? []) === JSON.stringify(expectedPlaywrightArgs),
    `${relativePath}:playwright args drifted`,
  );
  assert(!server?.env, `${relativePath}:playwright must not commit environment credentials`);
  if (requireTools) {
    assert(
      Array.isArray(server?.tools) && server.tools.includes('*'),
      `${relativePath}:playwright must expose its tools to Copilot`,
    );
  }
}

function validateCursorCloudflareServers(relativePath, servers) {
  validateCloudflareServerSet(relativePath, servers);
  for (const name of expectedCloudflareServerNames) {
    assert(servers[name]?.url === expectedRemoteUrls[name], `${relativePath}:${name} URL drifted`);
    assert(!servers[name]?.headers, `${relativePath}:${name} must authenticate through the supported client`);
    assert(!servers[name]?.env, `${relativePath}:${name} must not commit environment credentials`);
  }
}

function validateOpenCodeCloudflareServers(relativePath, servers) {
  validateCloudflareServerSet(relativePath, servers);
  for (const name of expectedCloudflareServerNames) {
    assert(servers[name]?.type === 'remote', `${relativePath}:${name} must use remote type`);
    assert(servers[name]?.url === expectedRemoteUrls[name], `${relativePath}:${name} URL drifted`);
    assert(servers[name]?.enabled === true, `${relativePath}:${name} must remain enabled`);
    assert(!servers[name]?.headers, `${relativePath}:${name} must authenticate through the supported client`);
    assert(!servers[name]?.env, `${relativePath}:${name} must not commit environment credentials`);
  }
}

function validateWindsurfCloudflareServers(relativePath, servers) {
  validateCloudflareServerSet(relativePath, servers);
  for (const name of expectedCloudflareServerNames) {
    assert(servers[name]?.serverUrl === expectedRemoteUrls[name], `${relativePath}:${name} URL drifted`);
    assert(!servers[name]?.headers, `${relativePath}:${name} must authenticate through the supported client`);
    assert(!servers[name]?.env, `${relativePath}:${name} must not commit environment credentials`);
  }
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

  assert(
    routedServers.playwright?.skills?.includes('control-room-repo-contract'),
    'playwright routing must include control-room-repo-contract',
  );
  assert(
    /browser|playwright|runtime/i.test(routedServers.playwright?.boundary ?? ''),
    'playwright routing must remain explicitly bound to browser/runtime proof',
  );

  for (const serverName of expectedCloudflareServerNames) {
    assert(
      routedServers[serverName]?.skills?.includes('control-room-cloudflare-agent-fleet'),
      `${serverName} routing must include control-room-cloudflare-agent-fleet`,
    );
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
const cursorConfig = readJson('.cursor/mcp.json');
const openCodeConfig = readJson('config/agent-fleet/opencode.jsonc');
const windsurfConfig = readJson('config/agent-fleet/windsurf-mcp_config.json');
const skillRouting = readJson('config/mcp-skill-routing.json');

const projectServers = projectConfig.mcpServers;
const exampleServers = exampleConfig.mcpServers;
const vscodeServers = vscodeConfig.servers;
const cursorServers = cursorConfig.mcpServers;
const openCodeServers = openCodeConfig.mcp;
const windsurfServers = windsurfConfig.mcpServers;

validateServerSet('.mcp.json', projectServers);
validateServerSet('.mcp.example.json', exampleServers);
validateServerSet('.vscode/mcp.json', vscodeServers);
validateCloudflareServerSet('.cursor/mcp.json', cursorServers);
validateCloudflareServerSet('config/agent-fleet/opencode.jsonc', openCodeServers);
validateCloudflareServerSet('config/agent-fleet/windsurf-mcp_config.json', windsurfServers);

validateRemoteServers('.mcp.json', projectServers);
validateRemoteServers('.mcp.example.json', exampleServers);
validateRemoteServers('.vscode/mcp.json', vscodeServers);
validatePlaywright('.mcp.json', projectServers.playwright, 'local', true);
validatePlaywright('.mcp.example.json', exampleServers.playwright, 'local', true);
validatePlaywright('.vscode/mcp.json', vscodeServers.playwright, 'stdio', false);
validateCursorCloudflareServers('.cursor/mcp.json', cursorServers);
validateOpenCodeCloudflareServers('config/agent-fleet/opencode.jsonc', openCodeServers);
validateWindsurfCloudflareServers('config/agent-fleet/windsurf-mcp_config.json', windsurfServers);

validateSupabase('.mcp.json', projectServers.supabase, 'oojzfmmywbvficgybaxd');
validateSupabase('.mcp.example.json', exampleServers.supabase, 'YOUR_CONTROL_ROOM_PROJECT_REF');
validateSupabase('.vscode/mcp.json', vscodeServers.supabase, 'oojzfmmywbvficgybaxd');
validateSkillRouting(skillRouting);

for (const [relativePath, parsed] of [
  ['.mcp.json', projectConfig],
  ['.mcp.example.json', exampleConfig],
  ['.vscode/mcp.json', vscodeConfig],
  ['.cursor/mcp.json', cursorConfig],
  ['config/agent-fleet/opencode.jsonc', openCodeConfig],
  ['config/agent-fleet/windsurf-mcp_config.json', windsurfConfig],
]) {
  assertNoCommittedSecrets(relativePath, parsed);
  const servers = parsed.mcpServers ?? parsed.servers ?? parsed.mcp;
  for (const forbidden of ['dbhub', 'netdata-cloud']) {
    assert(!servers[forbidden], `${relativePath}:${forbidden} is not justified in the current Control Room phase`);
  }
  if (servers.supabase) {
    assert(
      !String(servers.supabase.url ?? '').includes('tbsevonvegdnlyjgplmm'),
      `${relativePath}:Control Room must never point its standing MCP config at Bip's Supabase project`,
    );
  }
}

console.log('[verify:mcp] Control Room MCP configuration, Playwright proof authority, and Cloudflare agent-fleet routing are scoped, credential-free, and repository-bound.');
