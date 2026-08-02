'use strict';

const assert = require('node:assert/strict');
const {
  buildGmailReviewDigest,
  processFounderReviewReply,
  buildNotificationFailureCompensation,
  resolveNoReplyDeadline,
} = require('./buffer-review-window.cjs');

const scheduledPosts = [
  {
    channel: 'juss_rayy_linkedin',
    buffer_post_id: 'buffer-1',
    scheduled_at: '2026-08-02T21:20:00.000Z',
    validated_post_text: 'LinkedIn finished copy with verified traction, governance advantage, and clickable proof. https://example.com/proof',
  },
  {
    channel: 'juss_and_co_facebook',
    buffer_post_id: 'buffer-2',
    scheduled_at: '2026-08-02T21:20:00.000Z',
    validated_post_text: 'Facebook founder copy with verified traction, governance advantage, and clickable proof. https://example.com/proof',
  },
  {
    channel: 'juss_beautiful_hair_facebook',
    buffer_post_id: 'buffer-3',
    scheduled_at: '2026-08-02T21:20:00.000Z',
    validated_post_text: 'Facebook brand copy with verified traction, governance advantage, and clickable proof. https://example.com/proof',
  },
];

const digest = buildGmailReviewDigest({
  batch_id: '66cf315f-e1a0-4aad-9c76-355f1df30b54',
  scheduled_posts: structuredClone(scheduledPosts),
});
assert.equal(digest.notification_state, 'ready');
assert.equal(digest.gmail_action, 'gmail_send_email');
assert.equal(digest.scheduled_post_count, 3);
assert.equal(digest.no_reply_behavior, 'publish_by_existing_buffer_schedule');
assert.match(digest.gmail_body, /cancel all/);
assert.match(digest.gmail_body, /juss_rayy_linkedin/);
assert.equal(digest.review_token.length, 64);

const cancelAll = processFounderReviewReply({
  scheduled_posts: structuredClone(scheduledPosts),
  reply_text: 'cancel all',
  received_at: '2026-08-02T21:05:00.000Z',
  review_deadline: digest.review_deadline,
  review_token: digest.review_token,
  expected_review_token: digest.review_token,
}, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') });
assert.equal(cancelAll.review_action, 'cancel_all');
assert.equal(cancelAll.stop_publish, true);
assert.equal(cancelAll.operations.length, 3);
assert.equal(cancelAll.external_writes_required, 3);

const cancelOne = processFounderReviewReply({
  scheduled_posts: structuredClone(scheduledPosts),
  reply_text: 'juss_rayy_linkedin: cancel',
  received_at: '2026-08-02T21:05:00.000Z',
  review_deadline: digest.review_deadline,
  review_token: digest.review_token,
  expected_review_token: digest.review_token,
}, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') });
assert.equal(cancelOne.review_action, 'cancel_one');
assert.equal(cancelOne.operations[0].buffer_post_id, 'buffer-1');

const editOne = processFounderReviewReply({
  scheduled_posts: structuredClone(scheduledPosts),
  reply_text: 'juss_rayy_linkedin: make the proof line more direct',
  received_at: '2026-08-02T21:05:00.000Z',
  review_deadline: digest.review_deadline,
  review_token: digest.review_token,
  expected_review_token: digest.review_token,
}, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') });
assert.equal(editOne.review_action, 'edit_one');
assert.equal(editOne.requires_regeneration, true);
assert.equal(editOne.requires_content_firewall_revalidation, true);
assert.equal(editOne.external_writes_required, 0);
assert.equal(editOne.next_gate, 'regenerate_revalidate_then_update_buffer');

assert.throws(
  () => processFounderReviewReply({
    scheduled_posts: structuredClone(scheduledPosts),
    reply_text: 'make the proof line more direct',
    received_at: '2026-08-02T21:05:00.000Z',
    review_deadline: digest.review_deadline,
    review_token: digest.review_token,
    expected_review_token: digest.review_token,
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /multi-post replies must name a channel/,
);

assert.throws(
  () => processFounderReviewReply({
    scheduled_posts: structuredClone(scheduledPosts),
    reply_text: 'cancel all',
    received_at: '2026-08-02T21:20:01.000Z',
    review_deadline: digest.review_deadline,
    review_token: digest.review_token,
    expected_review_token: digest.review_token,
  }, { nowMs: Date.parse('2026-08-02T21:20:02.000Z') }),
  /after the review deadline/,
);

assert.throws(
  () => processFounderReviewReply({
    scheduled_posts: structuredClone(scheduledPosts),
    reply_text: 'cancel all',
    received_at: '2026-08-02T21:05:00.000Z',
    review_deadline: digest.review_deadline,
    review_token: 'forged',
    expected_review_token: digest.review_token,
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /review token mismatch/,
);

const compensation = buildNotificationFailureCompensation({
  scheduled_posts: structuredClone(scheduledPosts),
});
assert.equal(compensation.review_state, 'notification_failed');
assert.equal(compensation.operations.length, 3);
assert.equal(compensation.reserve_budget_required, true);

const noReply = resolveNoReplyDeadline({
  review_deadline: digest.review_deadline,
}, { nowMs: Date.parse('2026-08-02T21:20:00.000Z') });
assert.equal(noReply.review_action, 'no_change');
assert.equal(noReply.publish_behavior, 'publish_by_existing_buffer_schedule');
assert.equal(noReply.external_writes_required, 0);

console.log('Buffer review window verified: one budget-aware Gmail digest binds up to three scheduled posts; channel-scoped edits/cancels, notification compensation, token checks, deadline checks, and no-reply publication behavior fail closed.');
