'use strict';

const assert = require('node:assert/strict');
const { validateBufferPublishInput } = require('./buffer-content-firewall.cjs');

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

const validDraft = validateBufferPublishInput({
  post_text: founderLinkedInPost,
  content_field: 'linkedin_draft',
  channel: 'juss_rayy_linkedin',
  destination_mode: 'draft',
  publish_allowed: false,
  founder_approval_id: '',
  proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
  source_commit_sha: sha,
});

assert.equal(validDraft.content_validated, true);
assert.equal(validDraft.validated_post_text, founderLinkedInPost);

assert.equal(
  validateBufferPublishInput({
    post_text: brandFacebookPost,
    content_field: 'facebook_brand_draft',
    channel: 'juss_beautiful_hair_facebook',
    destination_mode: 'draft',
    publish_allowed: false,
    proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
    source_commit_sha: sha,
  }).content_validated,
  true,
);

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

assert.throws(
  () => validateBufferPublishInput({
    post_text: founderLinkedInPost,
    content_field: 'linkedin_draft',
    channel: 'juss_rayy_linkedin',
    destination_mode: 'queue',
    publish_allowed: false,
    proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
    source_commit_sha: sha,
  }),
  /requires publish_allowed=true and founder_approval_id/,
);

assert.equal(
  validateBufferPublishInput({
    post_text: founderLinkedInPost,
    content_field: 'linkedin_draft',
    channel: 'juss_rayy_linkedin',
    destination_mode: 'queue',
    publish_allowed: true,
    founder_approval_id: 'founder-approved:day3-buffer-copy',
    proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
    source_commit_sha: sha,
  }).destination_mode,
  'queue',
);

console.log('Buffer content firewall verified: finished post copy passes; prompts and unauthorized queue/publish payloads fail.');
