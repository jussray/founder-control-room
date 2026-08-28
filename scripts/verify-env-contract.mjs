#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function requireValue(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

function parseEnvTemplate(relativePath) {
  const source = read(relativePath);
  const entries = new Map();

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) {
      fail(`${relativePath}:${index + 1} must be a KEY=value assignment or comment`);
      return;
    }

    const [, key, value] = match;
    if (entries.has(key)) {
      fail(`${relativePath} declares ${key} more than once`);
      return;
    }
    entries.set(key, value.trim());
  });

  return { source, entries };
}

function isEnvLikeTrackedPath(relativePath) {
  const name = path.basename(relativePath);
  return name === '.env'
    || name.startsWith('.env.')
    || name === '.dev.vars'
    || name.startsWith('.dev.vars.');
}

function isSafeEnvTemplate(relativePath) {
  const name = path.basename(relativePath);
  return name === '.env.example'
    || /^\.env\..+\.example$/.test(name)
    || name === '.dev.vars.example'
    || /^\.dev\.vars\..+\.example$/.test(name);
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function looksLikeCommittedCredential(value) {
  const normalized = stripQuotes(value.trim());
  if (!normalized) return false;
  if (/\[YOUR-[^\]]+\]/i.test(normalized)) return false;
  if (/^(?:your[-_]|example(?:\.|$)|<[^>]+>$)/i.test(normalized)) return false;

  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(normalized)
    || /^(?:sk-(?:proj-)?|ghp_|github_pat_|re_)[A-Za-z0-9_-]{8,}$/.test(normalized)
    || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(normalized);
}

function quotedNames(source) {
  return [...source.matchAll(/["']([A-Z][A-Z0-9_]*)["']/g)].map((match) => match[1]);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

for (const requiredFile of [
  '.gitignore',
  '.env.example',
  '.env.local.example',
  'wrangler.worker.toml',
  'src/worker/handler.ts',
  'docs/SECRETS.md',
  '.github/workflows/deploy.yml',
]) {
  requireValue(existsSync(requiredFile), `missing environment-contract source: ${requiredFile}`);
}

const gitignore = read('.gitignore');
const ignoreRules = new Set(gitignore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
for (const rule of [
  '.env',
  '.env.*',
  '!.env.example',
  '!.env.*.example',
  '.dev.vars',
  '.dev.vars.*',
  '!.dev.vars.example',
  '!.dev.vars.*.example',
]) {
  requireValue(ignoreRules.has(rule), `.gitignore must contain ${rule}`);
}

const trackedPaths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
for (const trackedPath of trackedPaths) {
  if (isEnvLikeTrackedPath(trackedPath) && !isSafeEnvTemplate(trackedPath)) {
    fail(`tracked environment/secret-shaped file is not an explicit safe template: ${trackedPath}`);
  }
}

const safeTemplatePaths = trackedPaths.filter((trackedPath) => (
  isEnvLikeTrackedPath(trackedPath) && isSafeEnvTemplate(trackedPath)
));
requireValue(safeTemplatePaths.includes('.env.example'), '.env.example must remain the canonical safe template');
requireValue(safeTemplatePaths.includes('.env.local.example'), '.env.local.example must remain an explicit safe local template');

const templates = new Map();
for (const templatePath of safeTemplatePaths) {
  const parsed = parseEnvTemplate(templatePath);
  templates.set(templatePath, parsed);
  for (const [key, value] of parsed.entries) {
    if (looksLikeCommittedCredential(value)) {
      fail(`${templatePath} contains a credential-shaped value for ${key}`);
    }
  }
}

const canonicalEnv = templates.get('.env.example');
const localEnv = templates.get('.env.local.example');
requireValue(Boolean(canonicalEnv), '.env.example could not be parsed');
requireValue(Boolean(localEnv), '.env.local.example could not be parsed');

if (canonicalEnv && localEnv) {
  for (const key of localEnv.entries.keys()) {
    requireValue(
      canonicalEnv.entries.has(key),
      `.env.local.example uses ${key}, which is not declared by canonical .env.example`,
    );
  }

  for (const staleToken of [
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'ORIGIN_URL',
    "Se'kret Bip",
    'Vercel',
  ]) {
    requireValue(
      !localEnv.source.includes(staleToken),
      `.env.local.example contains stale cross-project/configuration token: ${staleToken}`,
    );
  }
}

const wrangler = read('wrangler.worker.toml');
const requiredSecretsMatch = wrangler.match(/\[secrets\][\s\S]*?required\s*=\s*\[([\s\S]*?)\]/m);
requireValue(Boolean(requiredSecretsMatch), 'wrangler.worker.toml must declare [secrets].required');
const workerRequiredSecrets = requiredSecretsMatch ? quotedNames(requiredSecretsMatch[1]) : [];
requireValue(workerRequiredSecrets.length > 0, 'Worker required secret set must not be empty');
for (const duplicate of duplicates(workerRequiredSecrets)) {
  fail(`wrangler.worker.toml repeats required secret ${duplicate}`);
}

const docs = read('docs/SECRETS.md');
if (canonicalEnv) {
  for (const secretName of workerRequiredSecrets) {
    requireValue(
      canonicalEnv.entries.has(secretName),
      `.env.example must declare Worker-required secret name ${secretName}`,
    );
    requireValue(
      docs.includes(secretName),
      `docs/SECRETS.md must document Worker-required secret ${secretName}`,
    );

    const escaped = secretName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    requireValue(
      !new RegExp(`^\\s*${escaped}\\s*=\\s*["'][^"']+["']\\s*$`, 'm').test(wrangler),
      `wrangler.worker.toml must not commit a value for required secret ${secretName}`,
    );
  }
}

const wranglerDeclaredNames = new Set([
  ...workerRequiredSecrets,
  ...[...wrangler.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]),
]);

const handler = read('src/worker/handler.ts');
const requiredBindingsMatch = handler.match(/const REQUIRED_STRING_BINDINGS\s*=\s*\[([\s\S]*?)\]\s+as const/m);
requireValue(Boolean(requiredBindingsMatch), 'Worker handler REQUIRED_STRING_BINDINGS contract is missing');
const centralRequiredBindings = requiredBindingsMatch ? quotedNames(requiredBindingsMatch[1]) : [];
requireValue(centralRequiredBindings.length > 0, 'Worker central required binding set must not be empty');

if (canonicalEnv) {
  for (const bindingName of centralRequiredBindings) {
    requireValue(
      canonicalEnv.entries.has(bindingName) || wranglerDeclaredNames.has(bindingName),
      `central Worker binding ${bindingName} is absent from both .env.example and Wrangler declarations`,
    );
  }
}

for (const githubAuthName of ['GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY']) {
  requireValue(workerRequiredSecrets.includes(githubAuthName), `Worker required secrets must include ${githubAuthName}`);
  requireValue(canonicalEnv?.entries.has(githubAuthName), `.env.example must declare ${githubAuthName}`);
}
requireValue(handler.includes('FCR_EMAIL'), 'Worker handler must retain the FCR_EMAIL binding contract');
requireValue(/\[\[send_email\]\][\s\S]*?name\s*=\s*["']FCR_EMAIL["']/m.test(wrangler), 'Wrangler must bind FCR_EMAIL as the project email capability');

const deployWorkflow = read('.github/workflows/deploy.yml');
const deploySecretNames = [...new Set(
  [...deployWorkflow.matchAll(/\bsecrets\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]),
)].sort();
requireValue(deploySecretNames.length > 0, 'canonical deploy workflow must reference named GitHub secrets');
for (const secretName of deploySecretNames) {
  requireValue(
    docs.includes(secretName),
    `docs/SECRETS.md must document canonical deploy workflow secret ${secretName}`,
  );
}

const workflowFiles = readdirSync('.github/workflows')
  .filter((name) => /\.ya?ml$/.test(name))
  .sort();
const workflowSecretNames = new Set();
for (const workflowFile of workflowFiles) {
  const source = read(path.join('.github/workflows', workflowFile));
  for (const match of source.matchAll(/\bsecrets\.([A-Z][A-Z0-9_]*)/g)) {
    workflowSecretNames.add(match[1]);
  }
}
const undocumentedWorkflowSecrets = [...workflowSecretNames]
  .filter((name) => !docs.includes(name))
  .sort();
notes.push(`safe env templates=${safeTemplatePaths.length}`);
notes.push(`Worker required secrets=${workerRequiredSecrets.length}`);
notes.push(`central boot string bindings=${centralRequiredBindings.length}`);
notes.push(`canonical deploy secret names=${deploySecretNames.length}`);
notes.push(`all workflow secret-name references=${workflowSecretNames.size}`);
notes.push(`workflow-only names not covered by canonical secrets registry=${undocumentedWorkflowSecrets.length}`);
if (undocumentedWorkflowSecrets.length) {
  notes.push(`workflow-only registry candidates=${undocumentedWorkflowSecrets.join(',')}`);
}

if (failures.length) {
  console.error('[verify:env-contract] failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  for (const note of notes) console.error(`note: ${note}`);
  process.exit(1);
}

console.log('[verify:env-contract] environment contract verified without reading provider secret values.');
for (const note of notes) console.log(`- ${note}`);
