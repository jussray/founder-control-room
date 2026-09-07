#!/usr/bin/env node

import { access, cp, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

await import('./verify-sekret-bip-control-room-bridge.mjs');

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = resolve(repositoryRoot, 'public');
const outputDirectory = resolve(repositoryRoot, 'dist-pages');

const requiredAssets = [
  'index.html',
  '_headers',
  '_worker.js',
  '.well-known/sekret-bip-control-room.json',
  'control-room/index.html',
  'control-room/app.js',
  'control-room/styles.css',
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
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });

for (const relativePath of requiredAssets) {
  const absolutePath = resolve(outputDirectory, relativePath);
  try {
    await access(absolutePath, constants.R_OK);
  } catch {
    throw new Error(`Cloudflare Pages output is missing required asset: ${relativePath}`);
  }
}

console.log(`Cloudflare Pages output ready: ${outputDirectory}`);
