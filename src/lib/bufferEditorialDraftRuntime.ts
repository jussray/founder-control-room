import { createHash } from 'node:crypto';
import { createBufferDirectProvider, type BufferDraftReceipt } from './bufferDirectProvider.js';
import { resolveBufferChannelBinding } from './bufferChannelBindings.js';
// @ts-expect-error -- checked-in CommonJS firewall remains the canonical draft-review contract.
import bufferContentFirewall from '../../tools/zapier/buffer-content-firewall.cjs';

export const BUFFER_EDITORIAL_DRAFT_RUNTIME_CONTRACT =
  'fcr/buffer-editorial-draft-runtime@v1' as const;

type JsonRecord = Record<string, unknown>;

interface FirewallModule {
  validateBufferPublishInput(
    input: JsonRecord,
    options?: { nowMs?: number },
  ): JsonRecord;
}

const firewall = bufferContentFirewall as FirewallModule;

export interface BufferEditorialDraftRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  now?: string;
  fetchImpl?: typeof fetch;
}

export interface BufferEditorialDraftRuntimeReceipt {
  contract: typeof BUFFER_EDITORIAL_DRAFT_RUNTIME_CONTRACT;
  provider: 'buffer';
  state: 'BUFFER_ACCEPTED_DRAFT';
  logicalChannel: string;
  providerChannelId: string;
  service: string;
  postId: string;
  status: 'draft';
  contentFingerprint: string;
  sourceCommitSha: string;
  invocationId: string;
  publishAllowed: false;
  scheduleAllowed: false;
  providerAcceptanceIsPublished: false;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function validNow(value: string | undefined): number {
  const raw = value?.trim() || new Date().toISOString();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error('BUFFER_DRAFT_RUNTIME_NOW_INVALID');
  return parsed;
}

function apiKey(env: NodeJS.ProcessEnv): string {
  const value = text(env.BUFFER_API_KEY);
  if (!value) throw new Error('BUFFER_API_KEY_NOT_CONFIGURED');
  return value;
}

function assertDraftContract(prepared: JsonRecord): void {
  const violations: string[] = [];
  if (prepared.destination_mode !== 'draft') violations.push('destination_mode');
  if (prepared.publish_allowed !== false) violations.push('publish_allowed');
  if (prepared.buffer_method !== 'draft') violations.push('buffer_method');
  if (prepared.buffer_save_to_draft !== true) violations.push('buffer_save_to_draft');
  if (prepared.scheduled_at !== null) violations.push('scheduled_at');
  if (prepared.buffer_api_due_at !== null) violations.push('buffer_api_due_at');
  if (prepared.share_now_allowed !== false) violations.push('share_now_allowed');
  if (prepared.authorization_receipt_verified !== true) violations.push('authorization_receipt_verified');

  if (violations.length > 0) {
    throw new Error(`BUFFER_DRAFT_RUNTIME_CONTRACT_DRIFT:${violations.join(',')}`);
  }
}

export async function executeBufferEditorialDraft(
  input: JsonRecord,
  options: BufferEditorialDraftRuntimeOptions = {},
): Promise<BufferEditorialDraftRuntimeReceipt> {
  const env = options.env ?? process.env;
  const nowMs = validNow(options.now);
  const prepared = firewall.validateBufferPublishInput(input, { nowMs });
  assertDraftContract(prepared);

  const logicalChannel = text(prepared.channel);
  const binding = resolveBufferChannelBinding(logicalChannel);
  const body = text(prepared.validated_post_text);
  const sourceCommitSha = text(prepared.source_commit_sha).toLowerCase();
  const invocationId = text(prepared.invocation_id);

  const provider = createBufferDirectProvider({
    apiKey: apiKey(env),
    fetchImpl: options.fetchImpl,
  });
  const receipt: BufferDraftReceipt = await provider.createDraftPost({
    channelId: binding.providerChannelId,
    text: body,
  });

  if (receipt.state !== 'BUFFER_ACCEPTED_DRAFT' || receipt.status !== 'draft') {
    throw new Error('BUFFER_DRAFT_RUNTIME_PROVIDER_STATE_INVALID');
  }
  if (receipt.channelId !== binding.providerChannelId) {
    throw new Error('BUFFER_DRAFT_RUNTIME_PROVIDER_CHANNEL_MISMATCH');
  }

  return {
    contract: BUFFER_EDITORIAL_DRAFT_RUNTIME_CONTRACT,
    provider: 'buffer',
    state: 'BUFFER_ACCEPTED_DRAFT',
    logicalChannel: binding.logicalChannel,
    providerChannelId: binding.providerChannelId,
    service: binding.service,
    postId: receipt.postId,
    status: 'draft',
    contentFingerprint: sha256({
      text: body,
      channel: binding.logicalChannel,
      providerChannelId: binding.providerChannelId,
      sourceCommitSha,
      invocationId,
    }),
    sourceCommitSha,
    invocationId,
    publishAllowed: false,
    scheduleAllowed: false,
    providerAcceptanceIsPublished: false,
  };
}
