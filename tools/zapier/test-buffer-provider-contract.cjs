'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const {
  validateBufferPublishInput,
  BUFFER_PROVIDER_ACTION,
  BUFFER_PROVIDER_METHOD,
  BUFFER_API_SAVE_TO_DRAFT,
} = require('./buffer-content-firewall.cjs');

const ROOT = resolve(__dirname, '../..');
const contract = JSON.parse(
  readFileSync(join(ROOT, 'config', 'buffer-provider-contract.json'), 'utf8'),
);

assert.equal(contract.version, 1);
assert.equal(contract.status, 'draft-only');
assert.equal(contract.provider, 'buffer');
assert.equal(contract.zapier.action, BUFFER_PROVIDER_ACTION);
assert.equal(contract.zapier.requiredMethod, BUFFER_PROVIDER_METHOD);
assert.deepEqual(contract.zapier.allowedMethods, [BUFFER_PROVIDER_METHOD]);
assert.equal(contract.api.mutation, 'createPost');
assert.equal(contract.api.required.saveToDraft, BUFFER_API_SAVE_TO_DRAFT);
assert.equal(contract.authority.publishAllowed, false);
assert.equal(contract.authority.liveProviderMutationIncluded, false);

const baseInput = {
  post_text: [
    'The repository now enforces Buffer draft-only provider fields in executable code.',
    'The firewall returns method draft and saveToDraft true, while queue and publish attempts fail closed.',
    'Proof: https://github.com/jussray/founder-control-room/pull/192',
  ].join('\n\n'),
  content_field: 'linkedin_draft',
  channel: 'juss_rayy_linkedin',
  destination_mode: 'draft',
  publish_allowed: false,
  proof_url: 'https://github.com/jussray/founder-control-room/pull/192',
  source_commit_sha: '38d8e5bd40594915407126915177f98c6ef983d9',
};

const prepared = validateBufferPublishInput(baseInput);
assert.equal(prepared.buffer_action, contract.zapier.action);
assert.equal(prepared.buffer_method, contract.zapier.requiredMethod);
assert.equal(prepared.buffer_save_to_draft, contract.api.required.saveToDraft);
assert.equal(prepared.destination_mode, 'draft');
assert.equal(prepared.publish_allowed, false);

for (const destinationMode of contract.zapier.rejectedMethods) {
  assert.throws(
    () => validateBufferPublishInput({
      ...baseInput,
      destination_mode: destinationMode,
      publish_allowed: true,
      founder_approval_id: 'founder-approved:cannot-widen-this-contract',
    }),
    /destination_mode must remain draft/,
    `${destinationMode} must fail closed in executable code`,
  );
}

assert.throws(
  () => validateBufferPublishInput({
    ...baseInput,
    destination_mode: '',
  }),
  /destination_mode must remain draft/,
  'missing destination mode must fail closed',
);

assert.throws(
  () => validateBufferPublishInput({
    ...baseInput,
    publish_allowed: true,
  }),
  /publish_allowed must remain false/,
  'publication authority drift must fail closed',
);

const callerOverride = validateBufferPublishInput({
  ...baseInput,
  method: 'share_now',
  buffer_method: 'share_now',
  saveToDraft: false,
  buffer_save_to_draft: false,
});
assert.equal(callerOverride.buffer_method, 'draft');
assert.equal(callerOverride.buffer_save_to_draft, true);

console.log('Buffer provider contract verified against executable firewall code: only draft output is produced, unsafe modes fail closed, and caller overrides cannot widen authority.');
