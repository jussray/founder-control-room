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

export interface V10ConveyorReceiptStore {
  store(receipt: V10ConveyorReceiptRecord): Promise<V10ConveyorReceiptStoreDisposition>;
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

async function findStoredReceipt(receiptId: string): Promise<StoredRow | null> {
  // Dynamic import keeps local/unit callers free from privileged Supabase env
  // requirements until production receipt persistence is actually requested.
  const { supabase } = await import('./supabaseClient.js');
  const { data, error } = await supabase
    .from('capability_execution_receipts')
    .select(RECEIPT_COLUMNS)
    .eq('receipt_id', receiptId)
    .maybeSingle();

  if (error) throw new Error('v10_conveyor_receipt_lookup_failed');
  return data as StoredRow | null;
}

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
