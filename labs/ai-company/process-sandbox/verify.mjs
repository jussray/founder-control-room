import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTAINER_SANDBOX_LIMITS,
  buildContainerRunArgs,
} from './host.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFile(join(root, name), 'utf8');

const employee = await read('employee.mjs');
const worker = await read('worker-entry.mjs');
const dockerfile = await read('Dockerfile');
const host = await read('host.mjs');

for (const [label, pattern] of [
  ['Node built-in import', /from\s+['"]node:/],
  ['process access', /\bprocess\./],
  ['outbound fetch', /\bfetch\s*\(/],
  ['WebSocket', /\bWebSocket\b/],
  ['dynamic import', /\bimport\s*\(/],
  ['CommonJS loading', /\brequire\s*\(/],
  ['dynamic evaluation', /\beval\s*\(|new\s+Function\b/],
]) {
  assert.equal(pattern.test(employee), false, `employee.mjs contains banned ${label}`);
}

for (const [label, pattern] of [
  ['filesystem import', /node:fs/],
  ['network import', /node:(?:net|tls|dns|dgram|http|https)/],
  ['child process import', /node:child_process/],
  ['worker thread import', /node:worker_threads/],
  ['dynamic import', /\bimport\s*\(/],
  ['CommonJS loading', /\brequire\s*\(/],
  ['dynamic evaluation', /\beval\s*\(|new\s+Function\b/],
]) {
  assert.equal(pattern.test(worker), false, `worker-entry.mjs contains banned ${label}`);
}

for (const invariant of [
  'FROM node:22.23.1-bookworm-slim',
  'USER 65534:65534',
  '--permission',
  '--allow-fs-read=/sandbox',
  '--no-addons',
  '--no-global-search-paths',
  '--no-experimental-websocket',
  '--max-old-space-size=32',
]) {
  assert.ok(dockerfile.includes(invariant), `Dockerfile missing ${invariant}`);
}

const args = buildContainerRunArgs('sandbox-contract:test');
const joined = args.join(' ');
for (const invariant of [
  '--network none',
  '--ipc none',
  '--read-only',
  `--memory ${CONTAINER_SANDBOX_LIMITS.memory}`,
  `--memory-swap ${CONTAINER_SANDBOX_LIMITS.memorySwap}`,
  `--cpus ${CONTAINER_SANDBOX_LIMITS.cpus}`,
  `--pids-limit ${CONTAINER_SANDBOX_LIMITS.pids}`,
  '--cap-drop ALL',
  '--security-opt no-new-privileges:true',
  '--user 65534:65534',
  '--workdir /sandbox',
]) {
  assert.ok(joined.includes(invariant), `container args missing ${invariant}`);
}

for (const forbidden of [
  '--privileged',
  '--volume',
  '--mount',
  '--device',
  '--env',
  '-e ',
  '--cap-add',
  '--network host',
]) {
  assert.equal(joined.includes(forbidden), false, `container args contain ${forbidden}`);
}

assert.ok(host.includes("shell: false"), 'host must never invoke Docker through a shell');
assert.ok(host.includes("child.kill('SIGKILL')"), 'host must enforce a hard kill deadline');
assert.equal(CONTAINER_SANDBOX_LIMITS.maxInputBytes, 32 * 1024);
assert.equal(CONTAINER_SANDBOX_LIMITS.maxOutputBytes, 64 * 1024);
assert.equal(CONTAINER_SANDBOX_LIMITS.timeoutMs, 3_000);

console.log('AI Company process sandbox boundary contract passed.');
