import { createHash } from 'node:crypto';
import {
  executeBufferEditorialDraft,
  prepareBufferEditorialDraft,
  type BufferEditorialDraftRuntimeReceipt,
} from '../lib/bufferEditorialDraftRuntime.js';

export const BUFFER_PUBLISHING_RUNTIME_CAPABILITY_ID =
  'buffer-publishing-runtime-v1' as const;

type JsonRecord = Record<string, unknown>;

export interface BufferDraftFounderIdentity {
  userId: string;
  email: string;
}

export interface BufferDraftProposal {
  contract: 'fcr/buffer-draft-proposal@v1';
  capabilityId: typeof BUFFER_PUBLISHING_RUNTIME_CAPABILITY_ID;
  proposalHash: string;
  founderFingerprint: string;
  projectSlug: string;
  logicalChannel: string;
  providerChannelId: string;
  service: string;
  contentFingerprint: string;
  sourceCommitSha: string;
  invocationId: string;
  publishAllowed: false;
  scheduleAllowed: false;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function founderFingerprint(founder: BufferDraftFounderIdentity): string {
  const userId = founder.userId.trim();
  const email = founder.email.trim().toLowerCase();
  if (!userId || !email) throw new Error('BUFFER_DRAFT_FOUNDER_IDENTITY_REQUIRED');
  return sha256({ userId, email });
}

export function previewBufferDraft(
  input: JsonRecord,
  founder: BufferDraftFounderIdentity,
  projectSlug: string,
  now?: string,
): BufferDraftProposal {
  const normalizedProjectSlug = projectSlug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedProjectSlug)) {
    throw new Error('BUFFER_DRAFT_PROJECT_SLUG_INVALID');
  }
  const prepared = prepareBufferEditorialDraft(input, { now });
  const founderHash = founderFingerprint(founder);
  const proposalHash = sha256({
    contract: 'fcr/buffer-draft-proposal@v1',
    capabilityId: BUFFER_PUBLISHING_RUNTIME_CAPABILITY_ID,
    founderFingerprint: founderHash,
    projectSlug: normalizedProjectSlug,
    contentFingerprint: prepared.proposalFingerprint,
    logicalChannel: prepared.logicalChannel,
    providerChannelId: prepared.providerChannelId,
    sourceCommitSha: prepared.sourceCommitSha,
    invocationId: prepared.invocationId,
    publishAllowed: false,
    scheduleAllowed: false,
  });

  return {
    contract: 'fcr/buffer-draft-proposal@v1',
    capabilityId: BUFFER_PUBLISHING_RUNTIME_CAPABILITY_ID,
    proposalHash,
    founderFingerprint: founderHash,
    projectSlug: normalizedProjectSlug,
    logicalChannel: prepared.logicalChannel,
    providerChannelId: prepared.providerChannelId,
    service: prepared.service,
    contentFingerprint: prepared.proposalFingerprint,
    sourceCommitSha: prepared.sourceCommitSha,
    invocationId: prepared.invocationId,
    publishAllowed: false,
    scheduleAllowed: false,
  };
}

export async function executeConfirmedBufferDraft(options: {
  input: JsonRecord;
  founder: BufferDraftFounderIdentity;
  projectSlug: string;
  proposalHash: string;
  confirmDraft: boolean;
  now?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<{ proposal: BufferDraftProposal; receipt: BufferEditorialDraftRuntimeReceipt }> {
  if (options.confirmDraft !== true) {
    throw new Error('BUFFER_DRAFT_CONFIRMATION_REQUIRED');
  }

  const proposal = previewBufferDraft(
    options.input,
    options.founder,
    options.projectSlug,
    options.now,
  );
  if (proposal.proposalHash !== options.proposalHash.trim()) {
    throw new Error('BUFFER_DRAFT_PROPOSAL_HASH_MISMATCH');
  }

  const receipt = await executeBufferEditorialDraft(options.input, {
    now: options.now,
    env: options.env,
    fetchImpl: options.fetchImpl,
  });

  if (receipt.contentFingerprint !== proposal.contentFingerprint) {
    throw new Error('BUFFER_DRAFT_EXECUTION_FINGERPRINT_MISMATCH');
  }

  return { proposal, receipt };
}
