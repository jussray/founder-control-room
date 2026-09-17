#!/usr/bin/env node

import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';

await import('./verify-sekret-bip-control-room-bridge.mjs');

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = resolve(repositoryRoot, 'public');
const outputDirectory = resolve(repositoryRoot, 'dist-pages');
const MAX_SECRET_SCAN_BYTES = 2 * 1024 * 1024;

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
  'control-room/opaque-session-bootstrap.js',
  'control-room/stack-router.js',
  'control-room/mission-live-ux.js',
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

const forbiddenArtifactPaths = [
  { label: '.git metadata', pattern: /(^|\/)\.git(?:\/|$)/i },
  { label: 'environment file', pattern: /(^|\/)\.env(?:\.[^/]+)?$/i },
  { label: 'OS metadata', pattern: /(^|\/)(?:\.DS_Store|Thumbs\.db)$/i },
  { label: 'private credential file', pattern: /(^|\/)(?:id_rsa|id_ed25519|credentials(?:\.json)?|service[-_]?account(?:\.json)?|[^/]+\.(?:pem|key|p12|pfx))$/i },
];

const forbiddenLiteralSecrets = [
  { label: 'private key material', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { label: 'OpenAI/Anthropic-style API key', pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: 'GitHub token', pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{16,}\b/ },
  { label: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function artifactPath(absolutePath) {
  return relative(outputDirectory, absolutePath).split('\\').join('/');
}

async function assertArtifactSafe() {
  for (const absolutePath of await collectFiles(outputDirectory)) {
    const packagedPath = artifactPath(absolutePath);
    for (const rule of forbiddenArtifactPaths) {
      if (rule.pattern.test(packagedPath)) {
        throw new Error(`Cloudflare Pages output contains forbidden ${rule.label}: ${packagedPath}`);
      }
    }

    const info = await stat(absolutePath);
    if (info.size > MAX_SECRET_SCAN_BYTES) continue;
    const bytes = await readFile(absolutePath);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    for (const rule of forbiddenLiteralSecrets) {
      if (rule.pattern.test(text)) {
        throw new Error(`Cloudflare Pages output contains ${rule.label}: ${packagedPath}`);
      }
    }
  }
}

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

await assertArtifactSafe();

console.log(`Cloudflare Pages output ready and leakage-checked: ${outputDirectory}`);
