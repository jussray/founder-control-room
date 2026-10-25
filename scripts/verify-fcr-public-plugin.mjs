#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), 'plugins/fcr-public');
const read = (path) => readFileSync(join(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const plugin = json('plugin.json');
const mcp = json('mcp.json');
const tests = json('review/test-cases.json');
const skill = read('skills/fcr-public-workflows/SKILL.md');
const instructions = read('README.md');
const endpoints = Object.values(mcp.mcpServers ?? {});

assert.equal(plugin.name, 'founder-control-room');
assert.equal(plugin.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
assert.equal(endpoints.length, 1);
const [server] = endpoints;
assert.equal(server.type, 'streamable-http');
assert.equal(server.url, 'https://api.foundercontrolroom.org/mcp/public');
assert.equal(server.extensions?.['com.openai']?.auth?.type, 'oauth');
assert.deepEqual(server.extensions?.['com.openai']?.auth?.baseScopes, ['openid']);
assert.ok(!JSON.stringify(mcp).includes('clientSecret'));
assert.ok(!JSON.stringify(mcp).includes('Authorization'));
assert.match(skill, /never run external actions/i);
assert.match(skill, /founder-only/i);
assert.match(instructions, /disabled-by-default candidate source/i);
assert.match(instructions, /PRE-RELEASE/);
assert.equal(tests.positive.length, 5);
assert.equal(tests.negative.length, 3);
assert.equal(new Set([...tests.positive, ...tests.negative].map(x=>x.id)).size, 8);
for (const c of [...tests.positive,...tests.negative]) {
  assert.ok(c.prompt?.trim() && c.expected?.trim());
}
console.log('[verify:fcr-public-plugin] PASS: 12 static assertions / 8 unexecuted review scenarios; no production readiness claim.');
