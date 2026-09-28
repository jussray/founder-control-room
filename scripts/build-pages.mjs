#!/usr/bin/env node

import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';

await import('./verify-sekret-bip-control-room-bridge.mjs');

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = resolve(repositoryRoot, 'public');
const outputDirectory = resolve(repositoryRoot, 'dist-pages');

const requiredAssets = [
  'index.html',
  '_headers',
  '_worker.js',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'crawlers.json',
  'work.html',
  '.well-known/sekret-bip-control-room.json',
  'control-room/index.html',
  'control-room/app.js',
  'control-room/styles.css',
  // These four files are load-bearing for the five-screen cockpit/runtime seam.
  // Packaging must fail closed if merge reconciliation ever drops one of them.
  'control-room/opaque-session-bootstrap.js',
  'control-room/safe-rate-limit-fetch.js',
  'control-room/five-screen-shell.js',
  'control-room/os-topology.js',
  'control-room/founder-shell.html',
  'control-room/founder-shell.css',
  'control-room/capabilities.html',
  'control-room/capabilities.js',
  'control-room/capabilities.css',
  'control-room/capital-decision.html',
  'control-room/capital-decision.js',
  'control-room/capital-decision.css',
  'control-room/security.html',
  'control-room/security.js',
  'control-room/security.css',
  'control-room/quickscan.html',
  'control-room/quickscan.js',
  'control-room/quickscan.css',
  'control-room/genesis.html',
  'control-room/genesis.css',
  'control-room/evidence-trust.html',
  'portable-founder-console/index.html',
  'juss-rayy/index.html',
  'mom8/index.html',
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });

// The FCR public origin is www.foundercontrolroom.org. Normalize only the
// deployed canonical origin; source-owned provenance such as dateModified
// must remain unchanged by packaging.
const founderProfilePath = resolve(outputDirectory, 'juss-rayy/index.html');
const founderProfile = await readFile(founderProfilePath, 'utf8');
const normalizedFounderProfile = founderProfile.replaceAll(
  'https://foundercontrolroom.org/juss-rayy',
  'https://www.foundercontrolroom.org/juss-rayy/',
);
await writeFile(founderProfilePath, normalizedFounderProfile, 'utf8');

for (const relativePath of requiredAssets) {
  const absolutePath = resolve(outputDirectory, relativePath);
  try {
    await access(absolutePath, constants.R_OK);
  } catch {
    throw new Error(`Cloudflare Pages output is missing required asset: ${relativePath}`);
  }
}

const blockedNames = [
  { label: 'git metadata', pattern: /(^|\/)\.git(?:\/|$)/i },
  { label: 'environment file', pattern: /(^|\/)\.env(?:\.|$)/i },
  { label: 'credential file', pattern: /(^|\/)(?:credentials|secrets?|id_rsa|id_ed25519|\.npmrc|\.netrc)(?:\.|$)/i },
];
const blockedContent = [
  { label: 'private key material', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: 'OpenAI secret key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: 'Anthropic secret key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'service-role assignment', pattern: /\bSUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]?[^\s'"<>]{8,}/i },
];
const leakageFindings = [];

async function scanPublicBundle(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    const relativePath = relative(outputDirectory, fullPath).replaceAll('\\', '/');

    for (const rule of blockedNames) {
      if (rule.pattern.test(relativePath)) leakageFindings.push(`${relativePath}: ${rule.label}`);
    }

    if (entry.isDirectory()) {
      await scanPublicBundle(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;

    const data = await readFile(fullPath);
    if (data.includes(0)) continue;
    const text = data.toString('utf8');
    for (const rule of blockedContent) {
      if (rule.pattern.test(text)) leakageFindings.push(`${relativePath}: ${rule.label}`);
    }
  }
}

await scanPublicBundle(outputDirectory);
if (leakageFindings.length) {
  console.error(`Public bundle leakage scan failed (${leakageFindings.length} finding(s)); matched values are intentionally suppressed.`);
  for (const finding of leakageFindings) console.error(`- ${finding}`);
  throw new Error('Cloudflare Pages public bundle failed leakage validation');
}

console.log('Public bundle leakage scan passed: no blocked metadata or secret signatures detected.');
console.log(`Cloudflare Pages output ready: ${outputDirectory}`);
