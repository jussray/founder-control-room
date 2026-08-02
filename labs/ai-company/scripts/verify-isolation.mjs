import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(resolved)));
    else files.push(resolved);
  }

  return files;
}

const bannedPatterns = [
  ['process access', /\bprocess\./],
  ['outbound fetch', /\bfetch\s*\(/],
  ['HTTP client', /node:https?|from\s+['"]https?['"]/],
  ['network socket', /node:(net|tls|dns|dgram)/],
  ['subprocess', /node:child_process/],
  ['worker execution', /node:worker_threads|\bWorker\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['Axios', /\baxios\b/i],
  ['GitHub client', /@octokit|github\.com\/repos/i],
  ['Supabase client', /@supabase|createClient\s*\(/i],
  ['Cloudflare client', /wrangler|cloudflare api/i],
  ['Buffer live client', /BUFFER_ACCESS_TOKEN|api\.buffer\.com/i],
  ['HubSpot client', /HUBSPOT_ACCESS_TOKEN|api\.hubapi\.com/i],
  ['filesystem mutation', /\b(writeFile|appendFile|rm|unlink|rename|mkdir)\s*\(/],
  ['dynamic code evaluation', /\beval\s*\(|new\s+Function\b|node:vm/],
  ['dynamic import', /\bimport\s*\(/],
  ['CommonJS module loading', /\brequire\s*\(/],
  ['timers', /\b(setTimeout|setInterval|setImmediate)\s*\(/],
  ['wall clock', /Date\.now\s*\(|new\s+Date\s*\(|performance\.now\s*\(/],
  ['randomness', /Math\.random\s*\(|randomUUID|node:crypto/],
];

const sourceFiles = (await walk(srcRoot)).filter((file) => file.endsWith('.mjs'));
assert.ok(sourceFiles.length > 0, 'no lab source files found');

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const relative = path.relative(root, file);

  for (const [label, pattern] of bannedPatterns) {
    assert.equal(pattern.test(source), false, `${relative}: banned ${label}`);
  }

  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  for (const specifier of imports) {
    assert.ok(
      specifier.startsWith('./') && !specifier.includes('../'),
      `${relative}: import escapes lab source boundary: ${specifier}`,
    );
  }
}

const packageJson = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
assert.equal(packageJson.private, true, 'lab package must remain private');
assert.equal(packageJson.dependencies, undefined, 'lab must have no runtime dependencies');
assert.equal(packageJson.devDependencies, undefined, 'lab must have no dev dependencies');

const fixtureFiles = (await walk(path.join(root, 'fixtures'))).filter((file) =>
  file.endsWith('.json'),
);
for (const file of fixtureFiles) {
  const fixture = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(
    fixture.dataClassification,
    'synthetic',
    `${path.relative(root, file)}: fixture must be synthetic`,
  );
}

const sandboxSource = await readFile(path.join(srcRoot, 'sandbox.mjs'), 'utf8');
for (const invariant of [
  "AI_COMPANY_SANDBOX_VERSION = 'ai-company-sandbox-v1'",
  'network: false',
  'providers: false',
  'database: false',
  'filesystem: false',
  'environment: false',
  'subprocess: false',
  'secrets: false',
  'dynamicCode: false',
  'wallClock: false',
  'randomness: false',
  'publicUrls: false',
]) {
  assert.ok(sandboxSource.includes(invariant), `sandbox missing invariant ${invariant}`);
}

console.log(
  `AI Company Lab isolation passed: ${sourceFiles.length} source files and ${fixtureFiles.length} synthetic fixtures.`,
);
