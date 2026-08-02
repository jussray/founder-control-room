'use strict';

const assert = require('node:assert/strict');
const {
  buildGmailReviewDigest,
  processFounderReviewReply,
  buildNotificationFailureCompensation,
  resolveNoReplyDeadline,
  extractReplyCommand,
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

const replyIdentity = {
  reply_from: 'Juss Ray <juss@example.com>',
  expected_reply_from: 'juss@example.com',
  gmail_thread_id: 'thread-123',
  expected_gmail_thread_id: 'thread-123',
};

assert.equal(
  extractReplyCommand('cancel all\r\n\r\nOn Sun, Aug 2, 2026 at 5:00 PM Founder Signal wrote:\r\n> Review window'),
  'cancel all',
);
assert.equal(
  extractReplyCommand('juss_rayy_linkedin: cancel\n\nSent from my iPhone'),
  'juss_rayy_linkedin: cancel',
);
assert.throws(
  () => extractReplyCommand('> cancel all\n> quoted history only'),
  /no unquoted command/,
);
assert.throws(
  () => extractReplyCommand('cancel all\njuss_rayy_linkedin: cancel'),
  /multiple unquoted command lines/,
);

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
assert.match(digest.gmail_body, /first non-empty line/);
assert.equal(digest.review_token.length, 64);

const cancelAll = processFounderReviewReply({
  scheduled_posts: structuredClone(scheduledPosts),
  reply_text: 'cancel all\r\n\r\nOn Sun, Aug 2, 2026 at 5:00 PM Founder Signal wrote:\r\n> prior message',
  received_at: '2026-08-02T21:05:00.000Z',
  review_deadline: digest.review_deadline,
  review_token: digest.review_token,
  expected_review_token: digest.review_token,
  ...replyIdentity,
}, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') });
assert.equal(cancelAll.review_action, 'cancel_all');
assert.equal(cancelAll.parsed_command, 'cancel all');
assert.equal(cancelAll.stop_publish, true);
assert.equal(cancelAll.operations.length, 3);
assert.equal(cancelAll.external_writes_required, 3);

const cancelOne = processFounderReviewReply({
  scheduled_posts: structuredClone(scheduledPosts),
  reply_text: 'juss_rayy_linkedin: cancel\n\nSent from my iPhone',
  received_at: '2026-08-02T21:05:00.000Z',
  review_deadline: digest.review_deadline,
  review_token: digest.review_token,
  expected_review_token: digest.review_token,
  ...replyIdentity,
}, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') });
assert.equal(cancelOne.review_action, 'cancel_one');
assert.equal(cancelOne.parsed_command, 'juss_rayy_linkedin: cancel');
assert.equal(cancelOne.operations[0].buffer_post_id, 'buffer-1');

const editOne = processFounderReviewReply({
  scheduled_posts: structuredClone(scheduledPosts),
  reply_text: 'juss_rayy_linkedin: make the proof line more direct',
  received_at: '2026-08-02T21:05:00.000Z',
  review_deadline: digest.review_deadline,
  review_token: digest.review_token,
  expected_review_token: digest.review_token,
  ...replyIdentity,
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
    ...replyIdentity,
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /multi-post replies must name a channel/,
);

assert.throws(
  () => processFounderReviewReply({
    scheduled_posts: structuredClone(scheduledPosts),
    reply_text: 'cancel all\njuss_rayy_linkedin: cancel',
    received_at: '2026-08-02T21:05:00.000Z',
    review_deadline: digest.review_deadline,
    review_token: digest.review_token,
    expected_review_token: digest.review_token,
    ...replyIdentity,
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /multiple unquoted command lines/,
);

assert.throws(
  () => processFounderReviewReply({
    scheduled_posts: structuredClone(scheduledPosts),
    reply_text: '> cancel all\n> quoted history only',
    received_at: '2026-08-02T21:05:00.000Z',
    review_deadline: digest.review_deadline,
    review_token: digest.review_token,
    expected_review_token: digest.review_token,
    ...replyIdentity,
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /no unquoted command/,
);

assert.throws(
  () => processFounderReviewReply({
    scheduled_posts: structuredClone(scheduledPosts),
    reply_text: 'cancel all',
    received_at: '2026-08-02T21:20:01.000Z',
    review_deadline: digest.review_deadline,
    review_token: digest.review_token,
    expected_review_token: digest.review_token,
    ...replyIdentity,
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
    ...replyIdentity,
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /review token mismatch/,
);

assert.throws(
  () => processFounderReviewReply({
    scheduled_posts: structuredClone(scheduledPosts),
    reply_text: 'cancel all',
    received_at: '2026-08-02T21:05:00.000Z',
    review_deadline: digest.review_deadline,
    review_token: digest.review_token,
    expected_review_token: digest.review_token,
    ...replyIdentity,
    reply_from: 'attacker@example.com',
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /reply sender does not match/,
);

assert.throws(
  () => processFounderReviewReply({
    scheduled_posts: structuredClone(scheduledPosts),
    reply_text: 'cancel all',
    received_at: '2026-08-02T21:05:00.000Z',
    review_deadline: digest.review_deadline,
    review_token: digest.review_token,
    expected_review_token: digest.review_token,
    ...replyIdentity,
    gmail_thread_id: 'wrong-thread',
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /Gmail thread mismatch/,
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

console.log('Buffer review window verified: one budget-aware Gmail digest binds up to three scheduled posts; one safe unquoted command, sender/thread/token/deadline checks, channel-scoped edits/cancels, notification compensation, and no-reply publication behavior fail closed.');
