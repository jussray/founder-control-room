#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), 'plugins/fcr-public');
const read = (path) => readFileSync(join(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const plugin = json('plugin.json');
const portable = json('portable.json');
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
assert.equal(portable.format, 'fcr-portable-mcp-profile/v1');
assert.equal(portable.id, 'org.foundercontrolroom.public');
assert.equal(portable.name, plugin.name);
assert.equal(portable.version, plugin.version);
assert.equal(portable.releaseStage, 'pre-release');
assert.equal(portable.mcp.transport, server.type);
assert.equal(portable.mcp.url, server.url);
assert.equal(portable.mcp.authentication.type, 'oauth2');
assert.deepEqual(portable.mcp.authentication.scopes, ['openid']);
assert.deepEqual(portable.tools.map(tool => tool.name).sort(), [...names].sort());
assert.ok(portable.tools.every(tool => tool.mode === 'read-only'));
assert.equal(portable.authority.externalActions, false);
assert.deepEqual(portable.authority.founderOnlyRoutesExcluded, ['/mcp', '/mcp/read']);
assert.equal(portable.skill, 'skills/fcr-public-workflows/SKILL.md');
assert.match(skill, /fcr_list_my_projects/);
assert.match(skill, /fcr_get_my_project/);
assert.match(skill, /model-agnostic/i);
const exportCheck = spawnSync('python3', ['scripts/export-fcr-public-plugin.py', '--check'], {
  cwd: process.cwd(), encoding: 'utf8',
});
assert.equal(exportCheck.status, 0, exportCheck.stderr || exportCheck.error?.message || 'ZIP self-test failed');
console.log(exportCheck.stdout.trim());
console.log('[verify:fcr-public-plugin] PASS: static FCR public package and portable ZIP checks; 8 review scenarios remain unexecuted; no live readiness claim.');
