import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LAB_ROOT = join(ROOT, 'src', 'founder-os-lab');

const forbiddenPatterns = [
  { pattern: /\bprocess\./, label: 'process access' },
  { pattern: /\bfetch\s*\(/, label: 'network fetch' },
  { pattern: /globalThis\.fetch/, label: 'global network fetch' },
  { pattern: /from\s+['"](?:node:)?(?:fs|http|https|net|tls|child_process|worker_threads)['"]/, label: 'side-effecting Node import' },
  { pattern: /from\s+['"][^'"]*supabase/i, label: 'Supabase import' },
  { pattern: /from\s+['"][^'"]*providerFactory/i, label: 'provider factory import' },
  { pattern: /from\s+['"]@octokit\//, label: 'GitHub client import' },
  { pattern: /from\s+['"]express['"]/, label: 'Express route import' },
  { pattern: /\bRouter\s*\(/, label: 'route construction' },
  { pattern: /\b(?:db|database|client|table|query|supabase)\s*\.\s*insert\s*\(/i, label: 'database insert' },
  { pattern: /\b(?:db|database|client|table|query|supabase)\s*\.\s*update\s*\(/i, label: 'database update' },
  { pattern: /\b(?:db|database|client|table|query|supabase)\s*\.\s*delete\s*\(/i, label: 'database delete' },
  { pattern: /executeFirstPartyPublication/, label: 'live social adapter execution' },
  { pattern: /\beval\s*\(|new\s+Function\b|node:vm/, label: 'dynamic code evaluation' },
  { pattern: /\bimport\s*\(/, label: 'dynamic import' },
  { pattern: /\brequire\s*\(/, label: 'CommonJS module loading' },
  { pattern: /\b(setTimeout|setInterval|setImmediate)\s*\(/, label: 'timer scheduling' },
  { pattern: /Date\.now\s*\(|new\s+Date\s*\(|performance\.now\s*\(/, label: 'wall clock read' },
  { pattern: /Math\.random\s*\(|\brandomUUID\s*\(|\brandomBytes\s*\(|\brandomFill(?:Sync)?\s*\(|getRandomValues\s*\(/, label: 'randomness' },
  { pattern: /\bWorker\b/, label: 'worker execution' },
];

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTypeScriptFiles(path));
    else if (extname(entry.name) === '.ts') files.push(path);
  }

  return files;
}

const failures = [];
const files = await collectTypeScriptFiles(LAB_ROOT);

if (files.length < 5) {
  failures.push(`expected at least five TypeScript lab files, found ${files.length}`);
}

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const displayPath = relative(ROOT, file);
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(source)) failures.push(`${displayPath}: forbidden ${rule.label}`);
  }
}

const contracts = await readFile(join(LAB_ROOT, 'contracts.ts'), 'utf8');
const engine = await readFile(join(LAB_ROOT, 'engine.ts'), 'utf8');
const registry = await readFile(join(LAB_ROOT, 'registry.ts'), 'utf8');
const kernel = await readFile(join(LAB_ROOT, 'capabilityKernel.ts'), 'utf8');
const sandbox = await readFile(join(LAB_ROOT, 'sandbox.ts'), 'utf8');
const conveyorSkills = await readFile(join(ROOT, 'src', 'lib', 'founderConveyorSkills.ts'), 'utf8');
const n8nArtifact = await readFile(join(ROOT, 'automation', 'n8n', 'founder-conveyor.workflow.json'), 'utf8');

for (const required of [
  'externalCalls: false',
  'providerCalls: false',
  'databaseWrites: false',
  'filesystemWrites: false',
  'environmentReads: false',
  'executionAllowed: false',
  "mode: 'simulation'",
  "level: 'L0'",
]) {
  if (!contracts.includes(required) && !engine.includes(required) && !sandbox.includes(required)) {
    failures.push(`missing isolation invariant ${JSON.stringify(required)}`);
  }
}

for (const required of [
  "chiefSkill: 'juss-chief-ai'",
  "V10_CAPABILITY_PLAN_CONTRACT = 'juss-v10/capability-plan@v1'",
  "V10_CAPABILITY_SELECTOR = 'chief-ai-machine'",
  'capability-plan-validation',
  'capability-provenance-validation',
  'authority-boundary-validation',
  "'buffer-handoff-preview'",
  "'buffer-preview'",
]) {
  if (!engine.includes(required) && !registry.includes(required) && !kernel.includes(required)) {
    failures.push(`missing V10 governance invariant ${JSON.stringify(required)}`);
  }
}

if (!conveyorSkills.includes('founderConveyorSkillsFromPlan')) {
  failures.push('conveyor must derive capability IDs from the Chief AI plan');
}
if (conveyorSkills.includes('SKILLS_BY_STAGE')) {
  failures.push('conveyor must not retain stage-based skill selection');
}
if (n8nArtifact.includes('const skillRoutes =')) {
  failures.push('n8n artifact must not retain hardcoded skill routing');
}
for (const required of [
  'founder-control-room/n8n-conveyor@v3',
  'juss-v10/capability-plan@v1',
  'capability selection must be owned by Chief AI Machine',
  'capabilityPlanHash',
  'registryHash',
]) {
  if (!n8nArtifact.includes(required)) failures.push(`n8n artifact missing V10 invariant ${JSON.stringify(required)}`);
}

for (const required of [
  "FOUNDER_OS_SANDBOX_VERSION = 'founder-os-sandbox-v1'",
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
  if (!sandbox.includes(required)) failures.push(`sandbox missing invariant ${JSON.stringify(required)}`);
}

if (failures.length > 0) {
  console.error('Founder OS lab isolation failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Founder OS lab isolation passed for ${files.length} TypeScript files.`);
console.log('Deterministic hashing is allowed; side effects and actual randomness remain forbidden.');
console.log('Chief AI owns capability selection; FCR/n8n retain governance/execution boundaries only.');
