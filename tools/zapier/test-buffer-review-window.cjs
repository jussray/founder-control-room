'use strict';

const assert = require('node:assert/strict');
const {
  buildGmailReviewDigest,
  buildReviewContextRegistration,
  processFounderReviewReply,
  buildNotificationFailureCompensation,
  resolveNoReplyDeadline,
  extractReplyCommand,
} = require('./buffer-review-window.cjs');

const batchId = '66cf315f-e1a0-4aad-9c76-355f1df30b54';
const replyContextId = '45bb874d-69d4-4b32-8df2-c7934bb888c5';
const replyToAddress = `review+${replyContextId}@foundercontrolroom.org`;

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
  reply_to_address: replyToAddress,
  expected_reply_to_address: replyToAddress,
  reply_context_id: replyContextId,
  expected_reply_context_id: replyContextId,
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
  batch_id: batchId,
  reply_context_id: replyContextId,
  reply_to_address: replyToAddress,
  scheduled_posts: structuredClone(scheduledPosts),
});
assert.equal(digest.notification_state, 'ready');
assert.equal(digest.gmail_action, 'gmail_send_email');
assert.equal(digest.gmail_reply_to, replyToAddress);
assert.equal(digest.reply_context_id, replyContextId);
assert.equal(digest.reply_ingress_required, 'instant_private_ingress');
assert.equal(digest.gmail_polling_allowed, false);
assert.equal(digest.scheduled_post_count, 3);
assert.equal(digest.no_reply_behavior, 'publish_by_existing_buffer_schedule');
assert.match(digest.gmail_body, /cancel all/);
assert.match(digest.gmail_body, /juss_rayy_linkedin/);
assert.match(digest.gmail_body, /first non-empty line/);
assert.match(digest.gmail_body, new RegExp(replyContextId));
assert.equal(digest.review_token.length, 64);

const contextRegistration = buildReviewContextRegistration({
  source_repo: 'jussray/founder-control-room',
  source_commit_sha: 'a'.repeat(40),
  founder_sender: 'Juss Ray <juss@example.com>',
  batch_id: batchId,
  reply_context_id: replyContextId,
  reply_to_address: replyToAddress,
  scheduled_posts: structuredClone(scheduledPosts),
});
assert.deepEqual(contextRegistration, {
  version: 1,
  sourceRepo: 'jussray/founder-control-room',
  sourceCommitSha: 'a'.repeat(40),
  batchId,
  replyContextId,
  founderSender: 'juss@example.com',
  replyToAddress,
  reviewDeadline: digest.review_deadline,
  reviewToken: digest.review_token,
  scheduledPosts: scheduledPosts.map((post) => ({
    channel: post.channel,
    bufferPostId: post.buffer_post_id,
    validatedPostText: post.validated_post_text,
    scheduledAt: post.scheduled_at,
  })),
});
assert.throws(
  () => buildReviewContextRegistration({
    source_repo: 'someone-else/repo',
    source_commit_sha: 'a'.repeat(40),
    founder_sender: 'juss@example.com',
    batch_id: batchId,
    reply_context_id: replyContextId,
    reply_to_address: replyToAddress,
    scheduled_posts: structuredClone(scheduledPosts),
  }),
  /source_repo must be an owned jussray repository/,
);

assert.throws(
  () => buildGmailReviewDigest({
    batch_id: batchId,
    reply_context_id: 'not-a-uuid',
    reply_to_address: replyToAddress,
    scheduled_posts: structuredClone(scheduledPosts),
  }),
  /reply_context_id must be a UUID/,
);

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
assert.equal(cancelAll.reply_context_id, replyContextId);
assert.equal(cancelAll.reply_to_address, replyToAddress);
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
    reply_to_address: 'review+wrong@foundercontrolroom.org',
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /reply recipient does not match/,
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
    reply_context_id: 'db4bedf0-a673-4a78-a699-9d4aa8aa6cd2',
  }, { nowMs: Date.parse('2026-08-02T21:05:01.000Z') }),
  /review context mismatch/,
);

const compensation = buildNotificationFailureCompensation({
  scheduled_posts: structuredClone(scheduledPosts),
});
assert.equal(compensation.review_state, 'notification_failed');
assert.equal(compensation.reason, 'gmail_notification_or_private_reply_setup_failed');
assert.equal(compensation.operations.length, 3);
assert.equal(compensation.reserve_budget_required, true);

const noReply = resolveNoReplyDeadline({
  review_deadline: digest.review_deadline,
}, { nowMs: Date.parse('2026-08-02T21:20:00.000Z') });
assert.equal(noReply.review_action, 'no_change');
assert.equal(noReply.publish_behavior, 'publish_by_existing_buffer_schedule');
assert.equal(noReply.external_writes_required, 0);

console.log('Buffer review window verified: exact schedule IDs bind to a private FCR review-context registration before Gmail; one safe unquoted command, founder/recipient/context/token/deadline checks, channel-scoped edits/cancels, compensation, and no-reply behavior fail closed.');
