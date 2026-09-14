#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = new URL('../public/.well-known/sekret-bip-control-room.json', import.meta.url);
const headersPath = new URL('../public/_headers', import.meta.url);
const buildScriptPath = new URL('./build-pages.mjs', import.meta.url);

const [manifestSource, headers, buildScript] = await Promise.all([
  readFile(manifestPath, 'utf8'),
  readFile(headersPath, 'utf8'),
  readFile(buildScriptPath, 'utf8'),
]);

const manifest = JSON.parse(manifestSource);
const peerOrigin = 'https://sekret-bip-audit.p9s5nbwqyt.chatgpt.site';

assert.equal(manifest.schemaVersion, '1.0.0');
assert.equal(manifest.bridgeId, 'sekret-bip-founder-control-room');
assert.deepEqual(manifest.publisher, {
  projectId: 'founder-control-room',
  runtimeOrigin: 'https://foundercontrolroom.org',
  controlRoom: 'https://foundercontrolroom.org/control-room/',
  apiOrigin: 'https://api.foundercontrolroom.org/',
  source: 'https://github.com/jussray/founder-control-room',
});
assert.deepEqual(manifest.peer, {
  projectId: 'sekret-bip',
  runtimeOrigin: peerOrigin,
  controlRoom: `${peerOrigin}/control-room`,
  manifest: `${peerOrigin}/api/control-room-link`,
});
assert.deepEqual(manifest.authority.founderControlRoom.actions, ['approve', 'execute']);
assert.deepEqual(manifest.authority.sekretBip.actions, ['observe', 'request']);
assert.equal(manifest.authority.sekretBip.actions.includes('execute'), false);
assert.deepEqual(manifest.connection, {
  registration: 'CONFIGURED',
  verification: 'REQUIRES_LIVE_READBACK',
});

for (const prohibited of ['journal content', 'mood content', 'AI conversation', 'youth data']) {
  assert.equal(manifest.privacy.prohibited.includes(prohibited), true);
}

assert.equal(
  headers.includes(
    '/.well-known/sekret-bip-control-room.json\n' +
      `  Access-Control-Allow-Origin: ${peerOrigin}\n` +
      '  Cache-Control: no-store',
  ),
  true,
);
assert.equal(
  buildScript.includes("'/.well-known/sekret-bip-control-room.json'"),
  false,
);
assert.equal(
  buildScript.includes("'.well-known/sekret-bip-control-room.json'"),
  true,
);

console.log(`Se’kret Bip runtime bridge contract verified from ${repositoryRoot}`);
