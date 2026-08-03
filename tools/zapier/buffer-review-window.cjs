'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');

const MAX_REPLY_LENGTH = 2000;
const CHANNEL_COMMAND = /^([^:]+):\s*(.+)$/s;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUOTE_OR_SIGNATURE_BOUNDARIES = [
  /^>/,
  /^-{2,}\s*original message\s*-{2,}$/i,
  /^on\s.+wrote:\s*$/i,
  /^(from|sent|to|subject):\s/i,
  /^--\s*$/,
  /^sent from my (iphone|ipad|android)/i,
  /^get outlook for/i,
];

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIsoTimestamp(value, fieldName) {
  const text = asTrimmedString(value);
  const timestamp = Date.parse(text);
  if (!text || !Number.isFinite(timestamp)) {
    throw new Error(`FOUNDER_REVIEW_REJECTED: ${fieldName} must be a valid ISO timestamp`);
  }
  return { text: new Date(timestamp).toISOString(), timestamp };
}

function normalizeEmail(value) {
  const text = asTrimmedString(value).toLowerCase();
  const bracketed = text.match(/<([^>]+)>/);
  const email = (bracketed ? bracketed[1] : text).trim();
  return EMAIL.test(email) ? email : null;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(asTrimmedString(left));
  const rightBuffer = Buffer.from(asTrimmedString(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isQuoteOrSignatureBoundary(line) {
  return QUOTE_OR_SIGNATURE_BOUNDARIES.some((pattern) => pattern.test(line));
}

function extractReplyCommand(value) {
  const raw = asTrimmedString(value);
  if (!raw) throw new Error('FOUNDER_REVIEW_REJECTED: reply_text is required');
  if (raw.length > MAX_REPLY_LENGTH) throw new Error('FOUNDER_REVIEW_REJECTED: reply_text is too long');

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let command = null;
  let quotedOrSignedRegion = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (quotedOrSignedRegion) continue;
    if (isQuoteOrSignatureBoundary(trimmed)) {
      quotedOrSignedRegion = true;
      continue;
    }
    if (command === null) {
      command = trimmed;
      continue;
    }
    throw new Error('FOUNDER_REVIEW_REJECTED: reply contains multiple unquoted command lines');
  }

  if (!command) {
    throw new Error('FOUNDER_REVIEW_REJECTED: reply contains no unquoted command');
  }
  return command;
}

function requireScheduledPosts(posts) {
  if (!Array.isArray(posts) || posts.length < 1 || posts.length > 3) {
    throw new Error('FOUNDER_REVIEW_REJECTED: scheduled_posts must contain one through three posts');
  }

  const channels = new Set();
  return posts.map((rawPost) => {
    const post = rawPost && typeof rawPost === 'object' ? rawPost : {};
    const channel = asTrimmedString(post.channel);
    const postId = asTrimmedString(post.buffer_post_id);
    const text = asTrimmedString(post.validated_post_text);
    const scheduledAt = parseIsoTimestamp(post.scheduled_at, 'scheduled_at').text;
    if (!channel || !postId || !text) {
      throw new Error('FOUNDER_REVIEW_REJECTED: each scheduled post requires channel, buffer_post_id, and validated_post_text');
    }
    const normalizedChannel = channel.toLowerCase();
    if (channels.has(normalizedChannel)) {
      throw new Error('FOUNDER_REVIEW_REJECTED: scheduled post channels must be unique');
    }
    channels.add(normalizedChannel);
    return {
      channel,
      buffer_post_id: postId,
      validated_post_text: text,
      scheduled_at: scheduledAt,
    };
  });
}

function requireReplyContext(input = {}) {
  const replyContextId = asTrimmedString(input.reply_context_id);
  if (!UUID.test(replyContextId)) {
    throw new Error('FOUNDER_REVIEW_REJECTED: reply_context_id must be a UUID');
  }
  const replyToAddress = normalizeEmail(input.reply_to_address);
  if (!replyToAddress) {
    throw new Error('FOUNDER_REVIEW_REJECTED: reply_to_address must be a valid email address');
  }
  return { replyContextId, replyToAddress };
}

function buildReviewToken({ batchId, replyContextId, replyToAddress, scheduledPosts }) {
  const canonical = [
    asTrimmedString(batchId),
    asTrimmedString(replyContextId),
    asTrimmedString(replyToAddress).toLowerCase(),
    ...scheduledPosts
      .map((post) => `${post.channel}|${post.buffer_post_id}|${post.scheduled_at}|${post.validated_post_text}`)
      .sort(),
  ].join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

function buildGmailReviewDigest(input = {}) {
  const batchId = asTrimmedString(input.batch_id);
  if (!batchId) throw new Error('FOUNDER_REVIEW_REJECTED: batch_id is required');
  const { replyContextId, replyToAddress } = requireReplyContext(input);
  const posts = requireScheduledPosts(input.scheduled_posts);
  const uniqueDeadlines = new Set(posts.map((post) => post.scheduled_at));
  if (uniqueDeadlines.size !== 1) {
    throw new Error('FOUNDER_REVIEW_REJECTED: campaign posts must share one review deadline');
  }

  const reviewDeadline = posts[0].scheduled_at;
  const reviewToken = buildReviewToken({
    batchId,
    replyContextId,
    replyToAddress,
    scheduledPosts: posts,
  });
  const sections = posts.map((post, index) => [
    `${index + 1}. ${post.channel}`,
    `Fire time: ${post.scheduled_at}`,
    `Buffer post ID: ${post.buffer_post_id}`,
    '',
    post.validated_post_text,
  ].join('\n'));

  return {
    batch_id: batchId,
    reply_context_id: replyContextId,
    reply_to_address: replyToAddress,
    notification_state: 'ready',
    notification_required: true,
    gmail_action: 'gmail_send_email',
    gmail_reply_to: replyToAddress,
    gmail_subject: `[Founder Signal Review] ${posts.length} scheduled post${posts.length === 1 ? '' : 's'} · ${reviewDeadline}`,
    gmail_body: [
      `Review window closes at ${reviewDeadline}.`,
      '',
      ...sections.flatMap((section) => [section, '', '---', '']),
      'Reply before the deadline with exactly one command on the first non-empty line:',
      '- cancel all',
      '- <channel>: cancel',
      '- <channel>: <requested tweak>',
      '',
      'Quoted history and standard mail signatures are ignored after that command. Additional unquoted command lines are rejected.',
      'A requested tweak must be regenerated and revalidated before Buffer is updated. No valid reply means Buffer keeps the existing scheduled fire time.',
      `Review context: ${replyContextId}`,
      `Review token: ${reviewToken}`,
    ].join('\n'),
    review_deadline: reviewDeadline,
    review_token: reviewToken,
    reply_contract: 'one_unquoted_channel_scoped_command_or_cancel_all',
    reply_ingress_required: 'instant_private_ingress',
    gmail_polling_allowed: false,
    no_reply_behavior: 'publish_by_existing_buffer_schedule',
    notification_failure_policy: 'cancel_scheduled_batch',
    scheduled_post_count: posts.length,
  };
}

function findPostByChannel(posts, requestedChannel) {
  const normalized = asTrimmedString(requestedChannel).toLowerCase();
  const matches = posts.filter((post) => post.channel.toLowerCase() === normalized);
  if (matches.length !== 1) {
    throw new Error(`FOUNDER_REVIEW_REJECTED: channel ${requestedChannel || '<empty>'} does not identify exactly one scheduled post`);
  }
  return matches[0];
}

function processFounderReviewReply(input = {}, options = {}) {
  const posts = requireScheduledPosts(input.scheduled_posts);

  if (!constantTimeEqual(input.review_token, input.expected_review_token)) {
    throw new Error('FOUNDER_REVIEW_REJECTED: review token mismatch');
  }

  const replyFrom = normalizeEmail(input.reply_from);
  const expectedReplyFrom = normalizeEmail(input.expected_reply_from);
  if (!replyFrom || !expectedReplyFrom || !constantTimeEqual(replyFrom, expectedReplyFrom)) {
    throw new Error('FOUNDER_REVIEW_REJECTED: reply sender does not match the founder mailbox');
  }

  const replyToAddress = normalizeEmail(input.reply_to_address);
  const expectedReplyToAddress = normalizeEmail(input.expected_reply_to_address);
  if (
    !replyToAddress ||
    !expectedReplyToAddress ||
    !constantTimeEqual(replyToAddress, expectedReplyToAddress)
  ) {
    throw new Error('FOUNDER_REVIEW_REJECTED: reply recipient does not match the private review address');
  }

  if (!constantTimeEqual(input.reply_context_id, input.expected_reply_context_id)) {
    throw new Error('FOUNDER_REVIEW_REJECTED: review context mismatch');
  }
  if (!UUID.test(asTrimmedString(input.reply_context_id))) {
    throw new Error('FOUNDER_REVIEW_REJECTED: reply_context_id must be a UUID');
  }

  const receivedAt = parseIsoTimestamp(input.received_at, 'received_at');
  const deadline = parseIsoTimestamp(input.review_deadline, 'review_deadline');
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  if (receivedAt.timestamp > deadline.timestamp) {
    throw new Error('FOUNDER_REVIEW_REJECTED: reply arrived after the review deadline');
  }
  if (receivedAt.timestamp > nowMs + 60 * 1000) {
    throw new Error('FOUNDER_REVIEW_REJECTED: received_at is too far in the future');
  }

  const replyCommand = extractReplyCommand(input.reply_text);
  const normalizedReply = replyCommand.toLowerCase();
  const sharedReceipt = {
    parsed_command: replyCommand,
    reply_context_id: asTrimmedString(input.reply_context_id),
    reply_to_address: replyToAddress,
    received_at: receivedAt.text,
    review_deadline: deadline.text,
  };

  if (normalizedReply === 'cancel' || normalizedReply === 'cancel all') {
    return {
      review_state: 'cancel_requested',
      review_action: 'cancel_all',
      ...sharedReceipt,
      stop_publish: true,
      operations: posts.map((post) => ({
        buffer_action: 'buffer_cancel_scheduled_post',
        buffer_post_id: post.buffer_post_id,
        channel: post.channel,
      })),
      external_writes_required: posts.length,
    };
  }

  const commandMatch = replyCommand.match(CHANNEL_COMMAND);
  if (!commandMatch) {
    if (posts.length === 1) {
      const [post] = posts;
      return {
        review_state: 'edit_requested',
        review_action: 'edit_one',
        ...sharedReceipt,
        target_channel: post.channel,
        buffer_post_id: post.buffer_post_id,
        edit_instruction: replyCommand,
        requires_regeneration: true,
        requires_content_firewall_revalidation: true,
        schedule_preserved: true,
        scheduled_at: post.scheduled_at,
        external_writes_required: 0,
        next_gate: 'regenerate_revalidate_then_update_buffer',
      };
    }
    throw new Error('FOUNDER_REVIEW_REJECTED: multi-post replies must name a channel');
  }

  const requestedChannel = commandMatch[1].trim();
  const instruction = commandMatch[2].trim();
  const post = findPostByChannel(posts, requestedChannel);

  if (instruction.toLowerCase() === 'cancel') {
    return {
      review_state: 'cancel_requested',
      review_action: 'cancel_one',
      ...sharedReceipt,
      target_channel: post.channel,
      stop_publish: false,
      operations: [{
        buffer_action: 'buffer_cancel_scheduled_post',
        buffer_post_id: post.buffer_post_id,
        channel: post.channel,
      }],
      external_writes_required: 1,
    };
  }

  return {
    review_state: 'edit_requested',
    review_action: 'edit_one',
    ...sharedReceipt,
    target_channel: post.channel,
    buffer_post_id: post.buffer_post_id,
    edit_instruction: instruction,
    requires_regeneration: true,
    requires_content_firewall_revalidation: true,
    schedule_preserved: true,
    scheduled_at: post.scheduled_at,
    external_writes_required: 0,
    next_gate: 'regenerate_revalidate_then_update_buffer',
  };
}

function buildNotificationFailureCompensation(input = {}) {
  const posts = requireScheduledPosts(input.scheduled_posts);
  return {
    review_state: 'notification_failed',
    review_action: 'cancel_all',
    stop_publish: true,
    reason: 'gmail_notification_or_private_reply_setup_failed',
    operations: posts.map((post) => ({
      buffer_action: 'buffer_cancel_scheduled_post',
      buffer_post_id: post.buffer_post_id,
      channel: post.channel,
    })),
    external_writes_required: posts.length,
    reserve_budget_required: true,
  };
}

function resolveNoReplyDeadline(input = {}, options = {}) {
  const deadline = parseIsoTimestamp(input.review_deadline, 'review_deadline');
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  if (nowMs < deadline.timestamp) {
    throw new Error('FOUNDER_REVIEW_REJECTED: review deadline has not elapsed');
  }
  return {
    review_state: 'window_elapsed',
    review_action: 'no_change',
    publish_behavior: 'publish_by_existing_buffer_schedule',
    external_writes_required: 0,
    review_deadline: deadline.text,
  };
}

module.exports = {
  buildGmailReviewDigest,
  processFounderReviewReply,
  buildNotificationFailureCompensation,
  resolveNoReplyDeadline,
  buildReviewToken,
  extractReplyCommand,
};
