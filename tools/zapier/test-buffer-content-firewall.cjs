'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const {
  validateBufferPublishInput,
  BUFFER_PROVIDER_ACTION,
  BUFFER_PROVIDER_METHOD,
  BUFFER_API_SAVE_TO_DRAFT,
} = require('./buffer-content-firewall.cjs');

const sha = '205a239486b6b542648ce2f125178814e358b816';

const founderLinkedInPost = `
I deleted the marketing before I added the design.

The latest storefront update removed claims the business had not yet earned the right to publish. The replacement is a four-part operating standard: Story. Quality. Care. Proof.

What is verified: the focused implementation exists, unsupported certainty was removed, and Cloudflare Pages built the exact branch head.

What remains unfinished: the change is not merged or live, and browser proof has not executed.

Proof: https://github.com/jussray/jussbeautifulhair-site/pull/27
`.trim();

const brandFacebookPost = `
Coming soon, but not live yet: The Crown Standard.

We are rebuilding part of the storefront around four promises: Story. Quality. Care. Proof. Product facts come before big adjectives, support remains part of the product, and missing evidence stays missing until verified.

This redesign is currently in preview and is not live on the production storefront yet.

Current storefront: https://jussbeautifulhair.com
`.trim();

const validInput = {
  post_text: founderLinkedInPost,
  content_field: 'linkedin_draft',
  channel: 'juss_rayy_linkedin',
  destination_mode: 'draft',
  publish_allowed: false,
  founder_approval_id: '',
  proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
  source_commit_sha: sha,
};

const validDraft = validateBufferPublishInput(validInput);

assert.equal(validDraft.content_validated, true);
assert.equal(validDraft.validated_post_text, founderLinkedInPost);
assert.equal(validDraft.destination_mode, 'draft');
assert.equal(validDraft.publish_allowed, false);
assert.equal(validDraft.founder_approval_id, null);
assert.equal(validDraft.buffer_action, BUFFER_PROVIDER_ACTION);
assert.equal(validDraft.buffer_action, 'buffer_add_to_queue');
assert.equal(validDraft.buffer_method, BUFFER_PROVIDER_METHOD);
assert.equal(validDraft.buffer_method, 'draft');
assert.equal(validDraft.buffer_save_to_draft, BUFFER_API_SAVE_TO_DRAFT);
assert.equal(validDraft.buffer_save_to_draft, true);

const brandDraft = validateBufferPublishInput({
  post_text: brandFacebookPost,
  content_field: 'facebook_brand_draft',
  channel: 'juss_beautiful_hair_facebook',
  destination_mode: 'draft',
  publish_allowed: false,
  proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
  source_commit_sha: sha,
});
assert.equal(brandDraft.content_validated, true);
assert.equal(brandDraft.buffer_method, 'draft');

assert.throws(
  () => validateBufferPublishInput({
    post_text: 'You are writing for Ray. Return this structure: {{GitHub PR title}}',
    content_field: 'linkedin_draft',
    channel: 'juss_rayy_linkedin',
    destination_mode: 'draft',
    publish_allowed: false,
    proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
    source_commit_sha: sha,
  }),
  /FOUNDER_SIGNAL_CONTENT_REJECTED/,
);

assert.throws(
  () => validateBufferPublishInput({
    post_text: founderLinkedInPost,
    content_field: 'prompt',
    channel: 'juss_rayy_linkedin',
    destination_mode: 'draft',
    publish_allowed: false,
    proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
    source_commit_sha: sha,
  }),
  /instruction input, not publishable copy/,
);

for (const destinationMode of ['queue', 'publish', 'schedule', 'share_now', 'share_next', 'schedule_draft']) {
  assert.throws(
    () => validateBufferPublishInput({
      ...validInput,
      destination_mode: destinationMode,
      publish_allowed: true,
      founder_approval_id: 'founder-approved:must-not-bypass-draft-lock',
    }),
    /destination_mode must remain draft/,
    `${destinationMode} must fail even when approval-looking input is supplied`,
  );
}

assert.throws(
  () => validateBufferPublishInput({
    ...validInput,
    publish_allowed: true,
    founder_approval_id: 'founder-approved:must-not-bypass-draft-lock',
  }),
  /publish_allowed must remain false/,
);

const overrideAttempt = validateBufferPublishInput({
  ...validInput,
  method: 'share_now',
  buffer_method: 'share_now',
  saveToDraft: false,
  buffer_save_to_draft: false,
});
assert.equal(overrideAttempt.buffer_method, 'draft');
assert.equal(overrideAttempt.buffer_save_to_draft, true);

const zapierLikeContext = {
  inputData: validInput,
  output: undefined,
};
vm.createContext(zapierLikeContext);
vm.runInContext(
  readFileSync(require.resolve('./buffer-content-firewall.cjs'), 'utf8'),
  zapierLikeContext,
  { filename: 'buffer-content-firewall.cjs' },
);

assert.equal(zapierLikeContext.output.content_validated, true);
assert.equal(zapierLikeContext.output.validated_post_text, founderLinkedInPost);
assert.equal(zapierLikeContext.output.buffer_action, 'buffer_add_to_queue');
assert.equal(zapierLikeContext.output.buffer_method, 'draft');
assert.equal(zapierLikeContext.output.buffer_save_to_draft, true);

console.log('Buffer content firewall verified: finished copy is forced to draft-only provider fields in Node and Zapier-like runtimes; prompts, queue, schedule, and publish attempts fail closed.');
