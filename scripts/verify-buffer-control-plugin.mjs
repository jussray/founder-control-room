import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = resolve(root, 'plugins/buffer-control');
const files = {
  portableManifest: resolve(pluginRoot, 'plugin.json'),
  portableMcp: resolve(pluginRoot, 'mcp.json'),
  compatibilityManifest: resolve(pluginRoot, '.codex-plugin/plugin.json'),
  compatibilityMcp: resolve(pluginRoot, '.mcp.json'),
  skill: resolve(pluginRoot, 'skills/buffer-control/SKILL.md'),
  readme: resolve(pluginRoot, 'README.md'),
};

const [
  portableManifestText,
  portableMcpText,
  compatibilityManifestText,
  compatibilityMcpText,
  skillText,
  readmeText,
] = await Promise.all([
  readFile(files.portableManifest, 'utf8'),
  readFile(files.portableMcp, 'utf8'),
  readFile(files.compatibilityManifest, 'utf8'),
  readFile(files.compatibilityMcp, 'utf8'),
  readFile(files.skill, 'utf8'),
  readFile(files.readme, 'utf8'),
]);

const portableManifest = JSON.parse(portableManifestText);
const portableMcp = JSON.parse(portableMcpText);
const compatibilityManifest = JSON.parse(compatibilityManifestText);
const compatibilityMcp = JSON.parse(compatibilityMcpText);
const errors = [];

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

const portablePluginSchema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const portableMcpSchema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const officialBufferMcp = 'https://mcp.buffer.com/mcp';

requireValue(portableManifest.$schema === portablePluginSchema, 'portable plugin manifest schema is invalid');
requireValue(portableManifest.name === 'juss-buffer-control', 'portable plugin name must be juss-buffer-control');
requireValue(portableManifest.version === '0.1.0', 'portable plugin version must be 0.1.0');
requireValue(typeof portableManifest.description === 'string' && portableManifest.description.includes('Buffer'), 'portable plugin description must name Buffer');

requireValue(compatibilityManifest.name === portableManifest.name, 'compatibility plugin name must match portable manifest');
requireValue(compatibilityManifest.version === portableManifest.version, 'compatibility plugin version must match portable manifest');
requireValue(compatibilityManifest.skills === './skills/', 'compatibility manifest skills path must be ./skills/');
requireValue(compatibilityManifest.mcpServers === './.mcp.json', 'compatibility manifest MCP path must be ./.mcp.json');

requireValue(portableMcp.$schema === portableMcpSchema, 'portable MCP schema is invalid');
const portableServerNames = Object.keys(portableMcp.mcpServers ?? {});
requireValue(portableServerNames.length === 1 && portableServerNames[0] === 'buffer', 'portable MCP must expose exactly one server named buffer');
const portableBuffer = portableMcp.mcpServers?.buffer ?? {};
requireValue(portableBuffer.type === 'streamable-http', 'portable Buffer MCP transport must be streamable-http');
requireValue(portableBuffer.url === officialBufferMcp, 'portable Buffer MCP URL must remain the official HTTPS endpoint');

const compatibilityServerNames = Object.keys(compatibilityMcp.mcpServers ?? {});
requireValue(compatibilityServerNames.length === 1 && compatibilityServerNames[0] === 'buffer', 'compatibility MCP must expose exactly one server named buffer');
const compatibilityBuffer = compatibilityMcp.mcpServers?.buffer ?? {};
requireValue(compatibilityBuffer.type === 'http', 'compatibility Buffer MCP transport must use HTTP');
requireValue(compatibilityBuffer.url === officialBufferMcp, 'compatibility Buffer MCP URL must remain the official HTTPS endpoint');

for (const [label, declaration] of [
  ['portable MCP', portableBuffer],
  ['compatibility MCP', compatibilityBuffer],
]) {
  requireValue(!Object.hasOwn(declaration, 'bearer_token_env_var'), `${label} must use OAuth discovery, not a bundled bearer-token variable`);
  requireValue(!Object.hasOwn(declaration, 'http_headers'), `${label} must not embed literal authorization headers`);
  requireValue(!Object.hasOwn(declaration, 'env_http_headers'), `${label} must not inject auth headers from package configuration`);
}

const combined = [
  portableManifestText,
  portableMcpText,
  compatibilityManifestText,
  compatibilityMcpText,
  skillText,
  readmeText,
].join('\n---BUFFER-CONTROL-FILE---\n');

const forbiddenSecretPatterns = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}\b/i,
  /"authorization"\s*:\s*"Bearer\s+/i,
  /BUFFER_API_KEY\s*=\s*[^\s${][^\s]*/,
];
for (const pattern of forbiddenSecretPatterns) {
  requireValue(!pattern.test(combined), `plugin package contains forbidden secret-like material matching ${pattern}`);
}

const requiredSkillStatements = [
  'Use Buffer as the external distribution transport while preserving Founder Control Room and Chief as the authority/evidence layer.',
  'Prefer the server\'s OAuth flow so authentication is established directly between the MCP client and Buffer.',
  'The plugin manifests intentionally contain no Buffer bearer token or API key.',
  '`shareNow` requires an explicit current instruction to publish now.',
  'If the founder says to post through Buffer but gives no exact time, use `addToQueue`.',
  'MEDIA_TRANSPORT_BLOCKED',
  'Never regenerate an approved campaign visual merely because transport is blocked.',
  '`JUSS SITE AUTOPSY`',
  'the approved set is the three cinematic black/red variants',
  'Preserve the $49 offer and `DM "AUTOPSY"` conversion path',
  'A successful `create_post` response is the first provider receipt.',
  'reserve `POSTED` for provider evidence showing it was sent/published.',
];
for (const statement of requiredSkillStatements) {
  requireValue(skillText.includes(statement), `Buffer skill is missing required governance statement: ${statement}`);
}

const requiredReadmeStatements = [
  'The normal connection path is OAuth against Buffer\'s official MCP server',
  'The plugin contains no Buffer credential, bearer token, or API key.',
  'A Buffer posting request with no exact time uses `addToQueue`',
  'MEDIA_TRANSPORT_BLOCKED',
  'a non-public test draft returns a real Buffer post ID',
  'Do not treat a request being sent as proof that Buffer accepted, scheduled, or published it.',
];
for (const statement of requiredReadmeStatements) {
  requireValue(readmeText.includes(statement), `Buffer README is missing proof boundary: ${statement}`);
}

if (errors.length > 0) {
  console.error('Buffer control plugin verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const fingerprint = createHash('sha256').update(combined).digest('hex');
console.log('Buffer control plugin verified.');
console.log(`MCP server: ${officialBufferMcp}`);
console.log('Authentication boundary: OAuth-first; no packaged bearer credential');
console.log(`Package fingerprint: sha256:${fingerprint}`);
console.log('Runtime state: SOURCE_VERIFIED_ONLY; OAuth connection/provider readback still required.');
