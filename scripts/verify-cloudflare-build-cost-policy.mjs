#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const policyPath = 'config/cloudflare-worker-git-authority-policy.json';
const workflowPath = '.github/workflows/cloudflare-build-cost-guard-apply.yml';

const policy = JSON.parse(await readFile(policyPath, 'utf8'));
const workflow = await readFile(workflowPath, 'utf8');

const fail = (message) => {
  throw new Error(`FCR_BUILD_COST_POLICY_INVALID: ${message}`);
};

if (policy.kind !== 'fcr/cloudflare-worker-git-authority-policy@v1') {
  fail('unexpected authority policy kind');
}
if (policy.workerName !== 'founder-control-room') {
  fail('cost policy must remain bound to founder-control-room');
}
if (policy.currentDesiredState !== 'non-promoting') {
  fail('native Worker Git must remain non-promoting');
}
if (policy.canAuthorizeProviderMutation !== false) {
  fail('desired-state policy may not become provider mutation authority');
}

const watch = policy.buildWatchPaths;
if (!watch || watch.mode !== 'enforced-cost-guard') {
  fail('buildWatchPaths must be an enforced cost guard');
}
if (watch.mutationAuthority !== 'explicit-cloudflare-build-cost-guard-workflow-only') {
  fail('watch-path mutation authority must remain isolated to the cost-guard workflow');
}
if (watch.providerReadbackRequired !== true || watch.rollbackRequiredOnMismatch !== true) {
  fail('provider readback and rollback must remain mandatory');
}

const expectedIncludes = ['*'];
const expectedExcludes = [
  '.agents/**',
  '.ai/**',
  '.github/**',
  'artifacts/**',
  'docs/**',
  'e2e/**',
  'skills/**',
  'test/**',
  '*.md',
];

const exact = (left, right) => Array.isArray(left)
  && left.length === right.length
  && left.every((value, index) => value === right[index]);

if (!exact(watch.pathIncludes, expectedIncludes)) {
  fail(`unexpected pathIncludes ${JSON.stringify(watch.pathIncludes)}`);
}
if (!exact(watch.pathExcludes, expectedExcludes)) {
  fail(`unexpected pathExcludes ${JSON.stringify(watch.pathExcludes)}`);
}

const requireText = (needle, message) => {
  if (!workflow.includes(needle)) fail(message);
};

requireText("CF_WORKER_NAME: founder-control-room", 'workflow Worker identity drifted');
requireText("pathIncludes: ['*']", 'workflow must preserve broad runtime include with explicit exclusions');
for (const excluded of expectedExcludes) {
  requireText(`'${excluded}'`, `workflow is missing exclusion ${excluded}`);
}
requireText(
  "body: { path_includes: desired.pathIncludes, path_excludes: desired.pathExcludes }",
  'provider PATCH must remain limited to watch paths',
);
requireText('buildRequested: false', 'cost guard must never request a native build');
requireText('deploymentRequested: false', 'cost guard must never request a deployment');
requireText('FCR Cloudflare watch-path readback mismatch.', 'provider readback falsifier is missing');
requireText(
  'body: { path_includes: before.pathIncludes, path_excludes: before.pathExcludes }',
  'rollback to exact before-state is missing',
);

if (workflow.includes('/builds/triggers/${triggerUuid}/builds')) {
  fail('cost guard must not call the native build-request endpoint');
}
if (/\bwrangler\s+deploy\b/i.test(workflow)) {
  fail('cost guard workflow must not deploy the Worker');
}

console.log('FCR_BUILD_COST_POLICY_VERIFIED');
console.log(`path_includes=${JSON.stringify(expectedIncludes)}`);
console.log(`path_excludes=${JSON.stringify(expectedExcludes)}`);
console.log('provider_mutation_scope=watch-paths-only');
console.log('build_requested=false deployment_requested=false rollback_required=true');
