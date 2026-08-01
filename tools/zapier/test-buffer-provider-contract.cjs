'use strict';

const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, resolve, relative, basename, extname } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const CONTRACT_PATH = join(ROOT, 'config', 'buffer-provider-contract.json');
const MATRIX_PATH = join(ROOT, 'docs', 'founder-signal-engine', 'buffer-provider-action-matrix.md');
const DAY3_PATH = join(ROOT, 'docs', 'founder-signal-engine', 'day3-buffer-content-boundary.md');

const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
const matrix = readFileSync(MATRIX_PATH, 'utf8');
const day3 = readFileSync(DAY3_PATH, 'utf8');

function validateProviderAction(input = {}) {
  const errors = [];

  if (input.action !== contract.zapier.action) {
    errors.push(`action must be ${contract.zapier.action}`);
  }
  if (input.method !== contract.zapier.requiredMethod) {
    errors.push(`method must be ${contract.zapier.requiredMethod}`);
  }
  if (input.destination_mode !== 'draft') {
    errors.push('destination_mode must remain draft');
  }
  if (input.publish_allowed !== false) {
    errors.push('publish_allowed must remain false for the draft-only milestone');
  }

  if (errors.length > 0) {
    throw new Error(`BUFFER_PROVIDER_CONTRACT_REJECTED: ${errors.join('; ')}`);
  }

  return {
    action: input.action,
    method: input.method,
    destination_mode: input.destination_mode,
    publish_allowed: input.publish_allowed,
    saveToDraft: contract.api.required.saveToDraft,
  };
}

assert.equal(contract.version, 1);
assert.equal(contract.status, 'draft-only');
assert.equal(contract.provider, 'buffer');
assert.equal(contract.zapier.action, 'buffer_add_to_queue');
assert.equal(contract.zapier.requiredMethod, 'draft');
assert.deepEqual(contract.zapier.allowedMethods, ['draft']);
assert.equal(contract.api.mutation, 'createPost');
assert.equal(contract.api.required.saveToDraft, true);
assert.equal(contract.authority.publishAllowed, false);
assert.equal(contract.authority.liveProviderMutationIncluded, false);
assert.equal(contract.defenseInDepth.requiresApprovalRole.requiresTeamPlan, true);
assert.equal(contract.defenseInDepth.requiresApprovalRole.organizationOwnerEligible, false);

const valid = validateProviderAction({
  action: 'buffer_add_to_queue',
  method: 'draft',
  destination_mode: 'draft',
  publish_allowed: false,
});
assert.equal(valid.method, 'draft');
assert.equal(valid.saveToDraft, true);

for (const method of ['queue', 'schedule', 'share_next', 'share_now', 'schedule_draft']) {
  assert.throws(
    () => validateProviderAction({
      action: 'buffer_add_to_queue',
      method,
      destination_mode: 'draft',
      publish_allowed: false,
    }),
    /method must be draft/,
    `${method} must fail closed`,
  );
}

assert.throws(
  () => validateProviderAction({
    action: 'buffer_add_to_queue',
    destination_mode: 'draft',
    publish_allowed: false,
  }),
  /method must be draft/,
  'missing method must fail closed',
);

for (const destinationMode of ['queue', 'publish']) {
  assert.throws(
    () => validateProviderAction({
      action: 'buffer_add_to_queue',
      method: 'draft',
      destination_mode: destinationMode,
      publish_allowed: false,
    }),
    /destination_mode must remain draft/,
    `${destinationMode} must fail in review-only mode`,
  );
}

assert.throws(
  () => validateProviderAction({
    action: 'buffer_add_to_queue',
    method: 'draft',
    destination_mode: 'draft',
    publish_allowed: true,
  }),
  /publish_allowed must remain false/,
  'draft-only contract must reject publication authority drift',
);

assert.match(matrix, /action: buffer_add_to_queue/);
assert.match(matrix, /method: draft # required; never rely on Buffer default/);
assert.match(matrix, /saveToDraft: true # required/);
assert.match(matrix, /not a free-plan control/);
assert.match(day3, /buffer-provider-action-matrix\.md/);
assert.match(day3, /method: draft # required; never rely on Buffer default/);

const ALLOWED_EXTENSIONS = new Set(['.md', '.json', '.cjs', '.mjs', '.js', '.ts']);
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage', 'test-results']);
const SELF = basename(__filename);
const references = [];

function scan(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const relativePath = relative(ROOT, fullPath);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry)) scan(fullPath);
      continue;
    }

    if (entry === SELF || !ALLOWED_EXTENSIONS.has(extname(entry))) continue;

    const source = readFileSync(fullPath, 'utf8');
    if (!source.includes('buffer_add_to_queue')) continue;

    references.push(relativePath);
    const pinned = (
      /method:\s*draft/.test(source)
      || /"requiredMethod"\s*:\s*"draft"/.test(source)
    );
    assert.equal(
      pinned,
      true,
      `${relativePath} references buffer_add_to_queue without pinning method: draft`,
    );
  }
}

for (const root of ['config', 'docs', 'tools']) {
  scan(join(ROOT, root));
}

assert.ok(references.length >= 2, 'expected canonical Buffer action references were not found');

console.log(
  `Buffer provider contract verified: ${references.length} pinned action reference(s); only method=draft and saveToDraft=true are authorized.`,
);
