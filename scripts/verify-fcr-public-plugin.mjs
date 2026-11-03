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
assert.equal(tests.status, 'test_cases_not_executed');
const configuredCases = plugin.extensions?.['com.openai']?.review?.test_cases;
assert.deepEqual(configuredCases, { positive: tests.positive, negative: tests.negative });
assert.equal(configuredCases.positive.length, 5);
assert.equal(configuredCases.negative.length, 3);
const names = new Set(['fcr_list_my_projects', 'fcr_get_my_project']);
for (const c of configuredCases.positive) {
  assert.ok(c.description?.trim() && c.prompt?.trim() && c.expected_behavior?.trim());
  const triggered = c.tools_triggered.split(',').map(name => name.trim());
  assert.ok(triggered.length > 0 && triggered.every(name => names.has(name)));
}
for (const c of configuredCases.negative) {
  assert.ok(c.description?.trim() && c.prompt?.trim());
  assert.ok(!('tools_triggered' in c));
}
console.log('[verify:fcr-public-plugin] PASS: 12 static assertions / 8 unexecuted review scenarios; no production readiness claim.');
