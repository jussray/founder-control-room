import { createHash, timingSafeEqual } from 'node:crypto';
import type { FounderSignalReviewEmailReceipt } from './receipt.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const SOURCE_REPO = /^jussray\/[A-Za-z0-9._-]{1,100}$/;
const CHANNEL = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_POST_TEXT_LENGTH = 5000;
const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024;
const MAX_DISPATCH_ATTEMPTS = 3;
const REVIEW_HOOK_TIMEOUT_MS = 15_000;

export interface FounderSignalScheduledReviewPost {
  channel: string;
  bufferPostId: string;
  validatedPostText: string;
  scheduledAt: string;
}

export interface FounderSignalReviewContextRegistration {
  version: 1;
  sourceRepo: string;
  sourceCommitSha: string;
  batchId: string;
  replyContextId: string;
  founderSender: string;
  replyToAddress: string;
  reviewDeadline: string;
  reviewToken: string;
  scheduledPosts: FounderSignalScheduledReviewPost[];
}

export interface FounderSignalReviewContext {
  version: 1;
  sourceRepo: string;
  sourceCommitSha: string;
  batchId: string;
  replyContextId: string;
  founderSenderRefHash: string;
  replyToRefHash: string;
  reviewTokenHash: string;
  reviewDeadline: string;
  scheduledPosts: FounderSignalScheduledReviewPost[];
}

export type FounderSignalReviewContextStoreDisposition =
  | 'stored'
  | 'duplicate'
  | 'conflict';

export interface FounderSignalReviewContextRepository {
  store(context: FounderSignalReviewContext): Promise<FounderSignalReviewContextStoreDisposition>;
  find(replyContextId: string): Promise<FounderSignalReviewContext | null>;
}

export type FounderSignalReviewDispatchState = 'pending' | 'accepted' | 'failed';

export interface FounderSignalReviewDispatchRecord {
  ingressId: string;
  replyContextId: string;
  idempotencyKey: string;
  providerRequestHash: string;
  providerActionsRequested: number;
  state: FounderSignalReviewDispatchState;
  providerHttpStatus: number | null;
  providerResponseHash: string | null;
  attempts: number;
}

export type FounderSignalReviewDispatchReserveDisposition =
  | 'reserved'
  | 'existing'
  | 'conflict';

export interface FounderSignalReviewDispatchRepository {
  reserve(record: FounderSignalReviewDispatchRecord): Promise<FounderSignalReviewDispatchReserveDisposition>;
  find(ingressId: string): Promise<FounderSignalReviewDispatchRecord | null>;
  recordAttempt(
    ingressId: string,
    state: 'accepted' | 'failed',
    providerHttpStatus: number | null,
    providerResponseHash: string | null,
  ): Promise<FounderSignalReviewDispatchRecord>;
}

export interface FounderSignalReviewProcessingResult {
  authorizationState:
    | 'context_authorized'
    | 'blocked_context_missing'
    | 'blocked_context_mismatch'
    | 'blocked_deadline_elapsed'
    | 'blocked_channel_mismatch'
    | 'blocked_dispatch_conflict';
  executionAllowed: boolean;
  providerDispatchAccepted: boolean;
  providerExecutionProven: false;
  providerActionsRequested: number;
  idempotencyKey: string | null;
}

export class FounderSignalReviewExecutionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'FounderSignalReviewExecutionError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalIso(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length > 64) {
    throw new FounderSignalReviewExecutionError(code);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FounderSignalReviewExecutionError(code);
  }
  return value;
}

function boundedString(
  value: unknown,
  code: string,
  options: { maxLength: number; pattern?: RegExp } = { maxLength: 200 },
): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0) {
    throw new FounderSignalReviewExecutionError(code);
  }
  if (value.length > options.maxLength || options.pattern && !options.pattern.test(value)) {
    throw new FounderSignalReviewExecutionError(code);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new FounderSignalReviewExecutionError(code);
  }
  return value;
}

function normalizeEmail(value: unknown, code: string): string {
  const raw = boundedString(value, code, { maxLength: 320 }).toLowerCase();
  const bracketed = raw.match(/<([^>]+)>/);
  const address = (bracketed ? bracketed[1] : raw).trim();
  if (!EMAIL.test(address)) throw new FounderSignalReviewExecutionError(code);
  return address;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function normalizeScheduledPosts(value: unknown): FounderSignalScheduledReviewPost[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new FounderSignalReviewExecutionError('invalid_scheduled_posts');
  }

  const channels = new Set<string>();
  return value.map((raw) => {
    if (!isRecord(raw)) throw new FounderSignalReviewExecutionError('invalid_scheduled_post');
    const channel = boundedString(raw.channel, 'invalid_channel', {
      maxLength: 100,
      pattern: CHANNEL,
    }).toLowerCase();
    if (channels.has(channel)) throw new FounderSignalReviewExecutionError('duplicate_channel');
    channels.add(channel);

    return {
      channel,
      bufferPostId: boundedString(raw.bufferPostId, 'invalid_buffer_post_id', {
        maxLength: 200,
        pattern: SAFE_PROVIDER_ID,
      }),
      validatedPostText: boundedString(raw.validatedPostText, 'invalid_validated_post_text', {
        maxLength: MAX_POST_TEXT_LENGTH,
      }),
      scheduledAt: canonicalIso(raw.scheduledAt, 'invalid_scheduled_at'),
    };
  });
}

export function buildFounderSignalReviewToken(input: {
  batchId: string;
  replyContextId: string;
  replyToAddress: string;
  scheduledPosts: FounderSignalScheduledReviewPost[];
}): string {
  const canonical = [
    input.batchId,
    input.replyContextId,
    input.replyToAddress.toLowerCase(),
    ...input.scheduledPosts
      .map((post) => `${post.channel}|${post.bufferPostId}|${post.scheduledAt}|${post.validatedPostText}`)
      .sort(),
  ].join('\n');
  return sha256(canonical);
}

export function validateFounderSignalReviewContextRegistration(
  value: unknown,
): FounderSignalReviewContext {
  if (!isRecord(value)) throw new FounderSignalReviewExecutionError('invalid_review_context');

  const allowed = new Set([
    'version',
    'sourceRepo',
    'sourceCommitSha',
    'batchId',
    'replyContextId',
    'founderSender',
    'replyToAddress',
    'reviewDeadline',
    'reviewToken',
    'scheduledPosts',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new FounderSignalReviewExecutionError('unknown_or_private_field');
  }
  if (value.version !== 1) throw new FounderSignalReviewExecutionError('invalid_version');

  const sourceRepo = boundedString(value.sourceRepo, 'invalid_source_repo', {
    maxLength: 108,
    pattern: SOURCE_REPO,
  });
  const sourceCommitSha = boundedString(value.sourceCommitSha, 'invalid_source_commit_sha', {
    maxLength: 40,
    pattern: COMMIT_SHA,
  }).toLowerCase();
  const batchId = boundedString(value.batchId, 'invalid_batch_id', {
    maxLength: 36,
    pattern: UUID,
  }).toLowerCase();
  const replyContextId = boundedString(value.replyContextId, 'invalid_reply_context_id', {
    maxLength: 36,
    pattern: UUID,
  }).toLowerCase();
  const founderSender = normalizeEmail(value.founderSender, 'invalid_founder_sender');
  const replyToAddress = normalizeEmail(value.replyToAddress, 'invalid_reply_to_address');
  const [replyLocal] = replyToAddress.split('@');
  if (replyLocal !== `review+${replyContextId}`) {
    throw new FounderSignalReviewExecutionError('reply_context_address_mismatch');
  }

  const reviewDeadline = canonicalIso(value.reviewDeadline, 'invalid_review_deadline');
  const scheduledPosts = normalizeScheduledPosts(value.scheduledPosts);
  const deadlines = new Set(scheduledPosts.map(post => post.scheduledAt));
  if (deadlines.size !== 1 || !deadlines.has(reviewDeadline)) {
    throw new FounderSignalReviewExecutionError('review_deadline_mismatch');
  }

  const reviewToken = boundedString(value.reviewToken, 'invalid_review_token', {
    maxLength: 64,
    pattern: SHA256,
  }).toLowerCase();
  const expectedReviewToken = buildFounderSignalReviewToken({
    batchId,
    replyContextId,
    replyToAddress,
    scheduledPosts,
  });
  if (!constantTimeEqual(reviewToken, expectedReviewToken)) {
    throw new FounderSignalReviewExecutionError('review_token_mismatch');
  }

  return {
    version: 1,
    sourceRepo,
    sourceCommitSha,
    batchId,
    replyContextId,
    founderSenderRefHash: sha256(founderSender),
    replyToRefHash: sha256(replyToAddress),
    reviewTokenHash: sha256(reviewToken),
    reviewDeadline,
    scheduledPosts,
  };
}

function sameContext(left: FounderSignalReviewContext, right: FounderSignalReviewContext): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function rowToContext(row: unknown): FounderSignalReviewContext | null {
  if (!isRecord(row) || !Array.isArray(row.scheduled_posts)) return null;
  try {
    const scheduledPosts = normalizeScheduledPosts(
      row.scheduled_posts.map((post) => isRecord(post) ? {
        channel: post.channel,
        bufferPostId: post.bufferPostId,
        validatedPostText: post.validatedPostText,
        scheduledAt: post.scheduledAt,
      } : post),
    );
    return {
      version: 1,
      sourceRepo: boundedString(row.source_repo, 'invalid_source_repo', {
        maxLength: 108,
        pattern: SOURCE_REPO,
      }),
      sourceCommitSha: boundedString(row.source_commit_sha, 'invalid_source_commit_sha', {
        maxLength: 40,
        pattern: COMMIT_SHA,
      }).toLowerCase(),
      batchId: boundedString(row.batch_id, 'invalid_batch_id', { maxLength: 36, pattern: UUID }).toLowerCase(),
      replyContextId: boundedString(row.reply_context_id, 'invalid_reply_context_id', { maxLength: 36, pattern: UUID }).toLowerCase(),
      founderSenderRefHash: boundedString(row.founder_sender_ref_hash, 'invalid_founder_sender_ref_hash', { maxLength: 64, pattern: SHA256 }),
      replyToRefHash: boundedString(row.reply_to_ref_hash, 'invalid_reply_to_ref_hash', { maxLength: 64, pattern: SHA256 }),
      reviewTokenHash: boundedString(row.review_token_hash, 'invalid_review_token_hash', { maxLength: 64, pattern: SHA256 }),
      reviewDeadline: canonicalIso(row.review_deadline, 'invalid_review_deadline'),
      scheduledPosts,
    };
  } catch {
    return null;
  }
}

async function findContext(replyContextId: string): Promise<FounderSignalReviewContext | null> {
  const { supabaseAdmin } = await import('../lib/supabase.js');
  const { data, error } = await supabaseAdmin()
    .from('founder_signal_review_contexts')
    .select('source_repo,source_commit_sha,batch_id,reply_context_id,founder_sender_ref_hash,reply_to_ref_hash,review_token_hash,review_deadline,scheduled_posts')
    .eq('reply_context_id', replyContextId)
    .maybeSingle();
  if (error) throw new Error('founder_review_context_lookup_failed');
  return rowToContext(data);
}

export const founderSignalReviewContextRepository: FounderSignalReviewContextRepository = {
  find: findContext,
  async store(context) {
    const existing = await findContext(context.replyContextId);
    if (existing) return sameContext(existing, context) ? 'duplicate' : 'conflict';

    const { supabaseAdmin } = await import('../lib/supabase.js');
    const { error } = await supabaseAdmin().from('founder_signal_review_contexts').insert({
      source_repo: context.sourceRepo,
      source_commit_sha: context.sourceCommitSha,
      batch_id: context.batchId,
      reply_context_id: context.replyContextId,
      founder_sender_ref_hash: context.founderSenderRefHash,
      reply_to_ref_hash: context.replyToRefHash,
      review_token_hash: context.reviewTokenHash,
      review_deadline: context.reviewDeadline,
      scheduled_posts: context.scheduledPosts,
    });
    if (!error) return 'stored';
    if ((error as { code?: string }).code !== '23505') {
      throw new Error('founder_review_context_store_failed');
    }
    const raced = await findContext(context.replyContextId);
    return raced && sameContext(raced, context) ? 'duplicate' : 'conflict';
  },
};

function rowToDispatch(row: unknown): FounderSignalReviewDispatchRecord | null {
  if (!isRecord(row)) return null;
  const state = row.state;
  if (!['pending', 'accepted', 'failed'].includes(String(state))) return null;
  const actions = Number(row.provider_actions_requested);
  const attempts = Number(row.attempts);
  const status = row.provider_http_status === null ? null : Number(row.provider_http_status);
  if (!Number.isInteger(actions) || actions < 1 || actions > 3) return null;
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 100) return null;
  if (status !== null && (!Number.isInteger(status) || status < 100 || status > 599)) return null;

  try {
    return {
      ingressId: boundedString(row.ingress_id, 'invalid_ingress_id', { maxLength: 36, pattern: UUID }).toLowerCase(),
      replyContextId: boundedString(row.reply_context_id, 'invalid_reply_context_id', { maxLength: 36, pattern: UUID }).toLowerCase(),
      idempotencyKey: boundedString(row.idempotency_key, 'invalid_idempotency_key', { maxLength: 200 }),
      providerRequestHash: boundedString(row.provider_request_hash, 'invalid_provider_request_hash', { maxLength: 64, pattern: SHA256 }),
      providerActionsRequested: actions,
      state: state as FounderSignalReviewDispatchState,
      providerHttpStatus: status,
      providerResponseHash: row.provider_response_hash === null
        ? null
        : boundedString(row.provider_response_hash, 'invalid_provider_response_hash', { maxLength: 64, pattern: SHA256 }),
      attempts,
    };
  } catch {
    return null;
  }
}

async function findDispatch(ingressId: string): Promise<FounderSignalReviewDispatchRecord | null> {
  const { supabaseAdmin } = await import('../lib/supabase.js');
  const { data, error } = await supabaseAdmin()
    .from('founder_signal_review_command_dispatches')
    .select('ingress_id,reply_context_id,idempotency_key,provider_request_hash,provider_actions_requested,state,provider_http_status,provider_response_hash,attempts')
    .eq('ingress_id', ingressId)
    .maybeSingle();
  if (error) throw new Error('founder_review_dispatch_lookup_failed');
  return rowToDispatch(data);
}

export const founderSignalReviewDispatchRepository: FounderSignalReviewDispatchRepository = {
  find: findDispatch,
  async reserve(record) {
    const existing = await findDispatch(record.ingressId);
    if (existing) {
      const same = existing.replyContextId === record.replyContextId
        && existing.idempotencyKey === record.idempotencyKey
        && existing.providerRequestHash === record.providerRequestHash
        && existing.providerActionsRequested === record.providerActionsRequested;
      return same ? 'existing' : 'conflict';
    }

    const { supabaseAdmin } = await import('../lib/supabase.js');
    const { error } = await supabaseAdmin().from('founder_signal_review_command_dispatches').insert({
      ingress_id: record.ingressId,
      reply_context_id: record.replyContextId,
      idempotency_key: record.idempotencyKey,
      provider_request_hash: record.providerRequestHash,
      provider_actions_requested: record.providerActionsRequested,
      state: 'pending',
      provider_http_status: null,
      provider_response_hash: null,
      attempts: 0,
    });
    if (!error) return 'reserved';
    if ((error as { code?: string }).code !== '23505') {
      throw new Error('founder_review_dispatch_reserve_failed');
    }
    const raced = await findDispatch(record.ingressId);
    const same = raced
      && raced.replyContextId === record.replyContextId
      && raced.idempotencyKey === record.idempotencyKey
      && raced.providerRequestHash === record.providerRequestHash
      && raced.providerActionsRequested === record.providerActionsRequested;
    return same ? 'existing' : 'conflict';
  },
  async recordAttempt(ingressId, state, providerHttpStatus, providerResponseHash) {
    const current = await findDispatch(ingressId);
    if (!current) throw new Error('founder_review_dispatch_missing');
    const attempts = current.attempts + 1;
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const { data, error } = await supabaseAdmin()
      .from('founder_signal_review_command_dispatches')
      .update({
        state,
        provider_http_status: providerHttpStatus,
        provider_response_hash: providerResponseHash,
        attempts,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('ingress_id', ingressId)
      .select('ingress_id,reply_context_id,idempotency_key,provider_request_hash,provider_actions_requested,state,provider_http_status,provider_response_hash,attempts')
      .single();
    if (error) throw new Error('founder_review_dispatch_update_failed');
    const normalized = rowToDispatch(data);
    if (!normalized) throw new Error('founder_review_dispatch_update_invalid');
    return normalized;
  },
};

function providerActionsForReceipt(
  receipt: FounderSignalReviewEmailReceipt,
  context: FounderSignalReviewContext,
): {
  actions: Array<Record<string, unknown>>;
  targetPost: FounderSignalScheduledReviewPost | null;
} | null {
  if (receipt.commandType === 'cancel_all') {
    return {
      actions: context.scheduledPosts.map(post => ({
        buffer_action: 'buffer_cancel_scheduled_post',
        buffer_post_id: post.bufferPostId,
        channel: post.channel,
      })),
      targetPost: null,
    };
  }

  const target = context.scheduledPosts.find(post => post.channel === receipt.targetChannel);
  if (!target) return null;
  if (receipt.commandType === 'cancel_one') {
    return {
      actions: [{
        buffer_action: 'buffer_cancel_scheduled_post',
        buffer_post_id: target.bufferPostId,
        channel: target.channel,
      }],
      targetPost: target,
    };
  }

  return {
    actions: [{
      buffer_action: 'regenerate_revalidate_update_scheduled_post',
      buffer_post_id: target.bufferPostId,
      channel: target.channel,
      scheduled_at: target.scheduledAt,
      validated_post_text: target.validatedPostText,
      edit_instruction: receipt.commandText.slice(`${target.channel}: `.length),
    }],
    targetPost: target,
  };
}

function blocked(
  authorizationState: FounderSignalReviewProcessingResult['authorizationState'],
): FounderSignalReviewProcessingResult {
  return {
    authorizationState,
    executionAllowed: false,
    providerDispatchAccepted: false,
    providerExecutionProven: false,
    providerActionsRequested: 0,
    idempotencyKey: null,
  };
}

export async function processFounderSignalReviewCommand(
  receipt: FounderSignalReviewEmailReceipt,
  options: {
    contextRepository?: FounderSignalReviewContextRepository;
    dispatchRepository?: FounderSignalReviewDispatchRepository;
    fetchImpl?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<FounderSignalReviewProcessingResult> {
  const contextRepository = options.contextRepository ?? founderSignalReviewContextRepository;
  const dispatchRepository = options.dispatchRepository ?? founderSignalReviewDispatchRepository;
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.now?.() ?? Date.now();

  const context = await contextRepository.find(receipt.replyContextId);
  if (!context) return blocked('blocked_context_missing');
  if (
    !constantTimeEqual(receipt.senderRefHash, context.founderSenderRefHash)
    || !constantTimeEqual(receipt.recipientRefHash, context.replyToRefHash)
  ) {
    return blocked('blocked_context_mismatch');
  }

  const deadlineMs = Date.parse(context.reviewDeadline);
  const receivedAtMs = Date.parse(receipt.receivedAt);
  if (receivedAtMs > deadlineMs || nowMs >= deadlineMs) {
    return blocked('blocked_deadline_elapsed');
  }

  const operation = providerActionsForReceipt(receipt, context);
  if (!operation) return blocked('blocked_channel_mismatch');

  const idempotencyKey = `founder-review:${receipt.ingressId}`;
  const payload = {
    version: 1,
    event_type: 'founder_review_command',
    idempotency_key: idempotencyKey,
    source_repo: context.sourceRepo,
    source_commit_sha: context.sourceCommitSha,
    batch_id: context.batchId,
    reply_context_id: context.replyContextId,
    ingress_id: receipt.ingressId,
    command_type: receipt.commandType,
    target_channel: receipt.targetChannel,
    command_hash: receipt.commandHash,
    received_at: receipt.receivedAt,
    review_deadline: context.reviewDeadline,
    operations: operation.actions,
    provider_execution_receipt_required: true,
  };
  const body = JSON.stringify(payload);
  const requestHash = sha256(body);
  const providerActionsRequested = operation.actions.length;
  const reserveDisposition = await dispatchRepository.reserve({
    ingressId: receipt.ingressId,
    replyContextId: receipt.replyContextId,
    idempotencyKey,
    providerRequestHash: requestHash,
    providerActionsRequested,
    state: 'pending',
    providerHttpStatus: null,
    providerResponseHash: null,
    attempts: 0,
  });
  if (reserveDisposition === 'conflict') {
    return blocked('blocked_dispatch_conflict');
  }

  const existing = await dispatchRepository.find(receipt.ingressId);
  if (existing?.state === 'accepted') {
    return {
      authorizationState: 'context_authorized',
      executionAllowed: true,
      providerDispatchAccepted: true,
      providerExecutionProven: false,
      providerActionsRequested,
      idempotencyKey,
    };
  }
  if (existing && existing.attempts >= MAX_DISPATCH_ATTEMPTS) {
    throw new FounderSignalReviewExecutionError('review_provider_dispatch_retry_exhausted');
  }

  const hookUrl = process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL?.trim();
  if (!hookUrl || !hookUrl.startsWith('https://')) {
    throw new FounderSignalReviewExecutionError('review_provider_hook_not_configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REVIEW_HOOK_TIMEOUT_MS);
  let response: Response;
  let responseText = '';
  try {
    response = await fetchImpl(hookUrl, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        'x-founder-review-idempotency-key': idempotencyKey,
      },
      body,
      signal: controller.signal,
    });
    responseText = await response.text();
  } catch {
    await dispatchRepository.recordAttempt(receipt.ingressId, 'failed', null, null);
    throw new FounderSignalReviewExecutionError('review_provider_dispatch_failed');
  } finally {
    clearTimeout(timeout);
  }

  if (Buffer.byteLength(responseText, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) {
    await dispatchRepository.recordAttempt(receipt.ingressId, 'failed', response.status, null);
    throw new FounderSignalReviewExecutionError('review_provider_response_too_large');
  }
  const responseHash = sha256(responseText || `http:${response.status}`);
  if (!response.ok) {
    await dispatchRepository.recordAttempt(receipt.ingressId, 'failed', response.status, responseHash);
    throw new FounderSignalReviewExecutionError('review_provider_dispatch_failed');
  }

  await dispatchRepository.recordAttempt(receipt.ingressId, 'accepted', response.status, responseHash);
  return {
    authorizationState: 'context_authorized',
    executionAllowed: true,
    providerDispatchAccepted: true,
    providerExecutionProven: false,
    providerActionsRequested,
    idempotencyKey,
  };
}
