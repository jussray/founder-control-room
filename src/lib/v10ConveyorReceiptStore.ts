import { createHash } from 'node:crypto';
import type { V10CapabilityAuthority } from '../founder-os-lab/capabilityKernel.js';

export type V10ConveyorReceiptStoreDisposition = 'stored' | 'duplicate' | 'conflict';

export interface V10ConveyorReceiptRecord {
  receiptId: string;
  runId: string;
  projectSlug: string;
  expectedHeadSha: string;
  capabilityPlanHash: string;
  registryHash: string;
  fromStage: string;
  toStage: string;
  requestedAuthority: V10CapabilityAuthority;
  executionStatus: 'accepted' | 'completed' | 'blocked' | 'failed';
  evidenceDigest: string | null;
}

export interface V10ConveyorActivationProbeRecord extends V10ConveyorReceiptRecord {
  createdAt: string;
}

export interface V10ConveyorReceiptStore {
  store(receipt: V10ConveyorReceiptRecord): Promise<V10ConveyorReceiptStoreDisposition>;
}

export interface V10ConveyorReceiptReader {
  latestActivationProbe(projectSlug: string): Promise<V10ConveyorActivationProbeRecord | null>;
}

type StoredRow = Record<string, unknown>;

const RECEIPT_COLUMNS = [
  'receipt_id',
  'run_id',
  'project_slug',
  'expected_head_sha',
  'capability_plan_hash',
  'registry_hash',
  'from_stage',
  'to_stage',
  'requested_authority',
  'execution_status',
  'evidence_digest',
].join(',');

const ACTIVATION_PROBE_COLUMNS = `${RECEIPT_COLUMNS},created_at`;

function normalizedEvidenceUrls(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function v10ConveyorEvidenceDigest(evidenceUrls: readonly string[]): string | null {
  const normalized = normalizedEvidenceUrls(evidenceUrls);
  if (normalized.length === 0) return null;
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function rowMatchesReceipt(row: StoredRow | null, receipt: V10ConveyorReceiptRecord): boolean {
  if (!row) return false;
  return row.receipt_id === receipt.receiptId
    && row.run_id === receipt.runId
    && row.project_slug === receipt.projectSlug
    && row.expected_head_sha === receipt.expectedHeadSha
    && row.capability_plan_hash === receipt.capabilityPlanHash
    && row.registry_hash === receipt.registryHash
    && row.from_stage === receipt.fromStage
    && row.to_stage === receipt.toStage
    && row.requested_authority === receipt.requestedAuthority
    && row.execution_status === receipt.executionStatus
    && (row.evidence_digest ?? null) === receipt.evidenceDigest;
}

function activationProbeFromRow(row: StoredRow | null): V10ConveyorActivationProbeRecord | null {
  if (!row) return null;
  const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
  const receiptId = typeof row.receipt_id === 'string' ? row.receipt_id : '';
  const runId = typeof row.run_id === 'string' ? row.run_id : '';
  const projectSlug = typeof row.project_slug === 'string' ? row.project_slug : '';
  const expectedHeadSha = typeof row.expected_head_sha === 'string' ? row.expected_head_sha : '';
  const capabilityPlanHash = typeof row.capability_plan_hash === 'string' ? row.capability_plan_hash : '';
  const registryHash = typeof row.registry_hash === 'string' ? row.registry_hash : '';
  const fromStage = typeof row.from_stage === 'string' ? row.from_stage : '';
  const toStage = typeof row.to_stage === 'string' ? row.to_stage : '';
  const requestedAuthority = typeof row.requested_authority === 'string' ? row.requested_authority : '';

  if (
    !createdAt
    || !receiptId
    || !runId
    || !projectSlug
    || !expectedHeadSha
    || !capabilityPlanHash
    || !registryHash
    || fromStage !== 'chat'
    || toStage !== 'workflows'
    || row.execution_status !== 'accepted'
    || !['reason', 'draft', 'reversible', 'privileged'].includes(requestedAuthority)
  ) {
    return null;
  }

  return {
    receiptId,
    runId,
    projectSlug,
    expectedHeadSha,
    capabilityPlanHash,
    registryHash,
    fromStage,
    toStage,
    requestedAuthority: requestedAuthority as V10CapabilityAuthority,
    executionStatus: 'accepted',
    evidenceDigest: typeof row.evidence_digest === 'string' ? row.evidence_digest : null,
    createdAt,
  };
}

async function findStoredReceipt(receiptId: string): Promise<StoredRow | null> {
  const { supabase } = await import('./supabaseClient.js');
  const { data, error } = await supabase
    .from('capability_execution_receipts')
    .select(RECEIPT_COLUMNS)
    .eq('receipt_id', receiptId)
    .maybeSingle();

  if (error) throw new Error('v10_conveyor_receipt_lookup_failed');
  return data as StoredRow | null;
}

async function findLatestActivationProbe(projectSlug: string): Promise<V10ConveyorActivationProbeRecord | null> {
  const normalizedProjectSlug = projectSlug.trim();
  if (!normalizedProjectSlug) return null;

  const { supabase } = await import('./supabaseClient.js');
  const { data, error } = await supabase
    .from('capability_execution_receipts')
    .select(ACTIVATION_PROBE_COLUMNS)
    .eq('project_slug', normalizedProjectSlug)
    .like('run_id', 'n8n-live-probe-%')
    .eq('from_stage', 'chat')
    .eq('to_stage', 'workflows')
    .eq('execution_status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('v10_conveyor_activation_probe_lookup_failed');
  return activationProbeFromRow(data as StoredRow | null);
}

export const supabaseV10ConveyorReceiptReader: V10ConveyorReceiptReader = {
  latestActivationProbe: findLatestActivationProbe,
};

export const supabaseV10ConveyorReceiptStore: V10ConveyorReceiptStore = {
  async store(receipt) {
    const existing = await findStoredReceipt(receipt.receiptId);
    if (existing) return rowMatchesReceipt(existing, receipt) ? 'duplicate' : 'conflict';

    const { supabase } = await import('./supabaseClient.js');
    const { error } = await supabase.from('capability_execution_receipts').insert({
      receipt_id: receipt.receiptId,
      run_id: receipt.runId,
      project_slug: receipt.projectSlug,
      expected_head_sha: receipt.expectedHeadSha,
      capability_plan_hash: receipt.capabilityPlanHash,
      registry_hash: receipt.registryHash,
      from_stage: receipt.fromStage,
      to_stage: receipt.toStage,
      requested_authority: receipt.requestedAuthority,
      execution_status: receipt.executionStatus,
      evidence_digest: receipt.evidenceDigest,
    });

    if (!error) return 'stored';
    if ((error as { code?: string }).code !== '23505') {
      throw new Error('v10_conveyor_receipt_store_failed');
    }

    const raced = await findStoredReceipt(receipt.receiptId);
    return rowMatchesReceipt(raced, receipt) ? 'duplicate' : 'conflict';
  },
};
