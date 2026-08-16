import { supabase } from '../lib/supabaseClient.js';
import {
  REASONING_RUN_CONTRACT,
  createReasoningRunReceipt,
  type ReasoningRunInput,
  type ReasoningRunReceipt,
} from '../reasoningRuns/reasoningRun.js';
import { storeBuildEvent } from './buildEventStore.js';

export type ReasoningRunStoreDisposition = 'stored' | 'duplicate' | 'conflict';

const EVENT_TYPE = 'reasoning_run_receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function storedReceipt(value: unknown): ReasoningRunReceipt | null {
  if (!isRecord(value) || value.contract !== REASONING_RUN_CONTRACT) return null;
  try {
    return createReasoningRunReceipt(value as unknown as ReasoningRunInput);
  } catch {
    return null;
  }
}

function sameReceipt(left: ReasoningRunReceipt, right: ReasoningRunReceipt): boolean {
  return left.receiptFingerprint === right.receiptFingerprint;
}

function sourceEventId(chainId: string, iteration: number): string {
  return `${REASONING_RUN_CONTRACT}:${chainId}:v${iteration}`;
}

async function verifyPriorReceipt(
  projectId: string,
  receipt: ReasoningRunReceipt,
): Promise<void> {
  if (receipt.iteration === 1) return;

  const priorFingerprint = receipt.priorReceiptFingerprint;
  if (!priorFingerprint) throw new Error('reasoning_run_prior_receipt_missing');

  const prior = await loadReasoningRun(projectId, receipt.chainId, receipt.iteration - 1);
  if (!prior) throw new Error('reasoning_run_prior_receipt_not_found');

  const continuous = prior.receiptFingerprint === priorFingerprint
    && prior.chainId === receipt.chainId
    && prior.iteration === receipt.iteration - 1
    && prior.stopReason === 'continue'
    && prior.projectSlug === receipt.projectSlug
    && prior.repository === receipt.repository
    && prior.intentFingerprint === receipt.intentFingerprint;

  if (!continuous) throw new Error('reasoning_run_prior_receipt_mismatch');
}

export async function storeReasoningRun(
  projectId: string,
  input: ReasoningRunReceipt | ReasoningRunInput,
): Promise<ReasoningRunStoreDisposition> {
  const receipt = createReasoningRunReceipt(input);
  await verifyPriorReceipt(projectId, receipt);

  const dedupeId = sourceEventId(receipt.chainId, receipt.iteration);
  const { error } = await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: dedupeId,
    event_type: EVENT_TYPE,
    severity: receipt.stopReason === 'blocked' ? 'warning' : 'info',
    screen: 'founder-reasoning-workflow',
    provider: receipt.source === 'chatgpt' ? 'chatgpt' : receipt.source,
    metadata: receipt,
    created_at: receipt.occurredAt,
  });

  let disposition: ReasoningRunStoreDisposition = 'stored';

  if (error) {
    if ((error as { code?: string }).code !== '23505') {
      throw new Error('reasoning_run_store_failed');
    }

    const { data: existing, error: lookupError } = await supabase
      .from('project_events')
      .select('metadata')
      .eq('project_id', projectId)
      .eq('source_event_id', dedupeId)
      .maybeSingle();

    if (lookupError) throw new Error('reasoning_run_duplicate_lookup_failed');
    const normalizedExisting = storedReceipt(existing?.metadata);
    if (!normalizedExisting) return 'conflict';
    disposition = sameReceipt(normalizedExisting, receipt) ? 'duplicate' : 'conflict';
  }

  if (disposition === 'conflict') return disposition;

  const buildDisposition = await storeBuildEvent(projectId, {
    eventId: `reasoning:${receipt.chainId}:v${receipt.iteration}`,
    occurredAt: receipt.occurredAt,
    source: receipt.source,
    category: 'artifact',
    phase: 'learn',
    truth: 'verified',
    authority: 'observed',
    status: receipt.stopReason === 'blocked' ? 'blocked' : 'completed',
    ...(receipt.currentHeadSha && receipt.repository
      ? {
          repository: {
            name: receipt.repository,
            commitSha: receipt.currentHeadSha,
          },
        }
      : {}),
    ...(receipt.nextGateCode ? { nextGate: receipt.nextGateCode } : {}),
    evidenceRefs: [
      `reasoning-chain:${receipt.chainId}:v${receipt.iteration}`,
      `reasoning-fingerprint:${receipt.receiptFingerprint}`,
      `intent-fingerprint:${receipt.intentFingerprint}`,
      ...receipt.artifacts.map((artifact) => `artifact:${artifact.artifactId}:${artifact.sha256}`),
    ],
  });

  if (buildDisposition === 'conflict') {
    throw new Error('reasoning_run_build_event_conflict');
  }

  return disposition;
}

export async function loadReasoningRun(
  projectId: string,
  chainId: string,
  iteration: number,
): Promise<ReasoningRunReceipt | null> {
  const { data, error } = await supabase
    .from('project_events')
    .select('metadata')
    .eq('project_id', projectId)
    .eq('source_event_id', sourceEventId(chainId, iteration))
    .maybeSingle();

  if (error) throw new Error('reasoning_run_read_failed');
  return storedReceipt(data?.metadata);
}
