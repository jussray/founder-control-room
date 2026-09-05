import { createHash } from 'node:crypto';
import {
  FOUNDER_PROOF_AUDIT_LIFECYCLE_CONTRACT,
  evaluateFounderProofAuditLifecycle,
  type FounderProofAuditLifecycleReceipt,
} from '../lib/founderProofAuditLifecycle.js';

export const FOUNDER_PROOF_AUDIT_INTERNAL_DRY_RUN_CONTRACT =
  'fcr/founder-proof-audit-internal-dry-run@v1' as const;

const FCR_PROJECT_SLUG = 'founder-control-room';
const EVENT_TYPE = 'founder_proof_audit_dry_run_receipt';
const EXACT_SHA = /^[0-9a-f]{40}$/i;

export type FounderProofAuditDryRunPersistence = 'stored' | 'duplicate' | 'conflict';

export interface FounderProofAuditInternalDryRun {
  contract: typeof FOUNDER_PROOF_AUDIT_INTERNAL_DRY_RUN_CONTRACT;
  runtimeSha: string;
  testCase: 'founder-proof-audit-lifecycle-smoke';
  sourceEventId: string;
  inputFingerprint: string;
  receipt: FounderProofAuditLifecycleReceipt;
  guarantees: {
    shopifyOrderPerformed: false;
    shopifyPaymentPerformed: false;
    customerDeliveryPerformed: false;
    auditedTargetMutationPerformed: false;
    receiptPersistenceOnly: true;
  };
}

export interface FounderProofAuditInternalDryRunResult {
  dryRun: FounderProofAuditInternalDryRun;
  persistence: FounderProofAuditDryRunPersistence;
  projectId: string;
}

export interface FounderProofAuditDryRunStore {
  persist(dryRun: FounderProofAuditInternalDryRun): Promise<{
    disposition: FounderProofAuditDryRunPersistence;
    projectId: string;
  }>;
}

function normalizedRuntimeSha(value: string): string {
  const sha = value.trim().toLowerCase();
  if (!EXACT_SHA.test(sha)) {
    throw new Error('FOUNDER_PROOF_AUDIT_DRY_RUN_REQUIRES_EXACT_RUNTIME_SHA');
  }
  return sha;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalJson(item));
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJson(item)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

export function founderProofAuditDryRunMetadataFingerprint(value: unknown): string {
  return fingerprint(canonicalJson(value));
}

function sameMetadata(left: unknown, right: unknown): boolean {
  return founderProofAuditDryRunMetadataFingerprint(left)
    === founderProofAuditDryRunMetadataFingerprint(right);
}

export function createFounderProofAuditInternalDryRun(
  runtimeShaInput: string,
): FounderProofAuditInternalDryRun {
  const runtimeSha = normalizedRuntimeSha(runtimeShaInput);
  const auditId = `internal-dry-run-${runtimeSha.slice(0, 12)}`;
  const lifecycleInput = {
    mode: 'DRY_RUN' as const,
    auditId,
    scope: {
      targetType: 'SAAS_FEATURE' as const,
      targetRef: `fcr://runtime/${runtimeSha}/founder-proof-audit-lifecycle`,
      objective: 'Prove the internal Founder Proof Audit lifecycle wiring without payment, customer delivery, or audited-target mutation.',
      authorizedEvidenceRefs: [
        `fcr://runtime/${runtimeSha}/founder-proof-audit-lifecycle`,
        `fcr://source/${runtimeSha}/founder-proof-audit-lifecycle`,
      ],
      productionMutationAuthorizationRef: null,
    },
    commerce: {
      status: 'NOT_EXECUTED' as const,
      source: 'none' as const,
      evidenceRef: null,
    },
    intake: {
      status: 'VALIDATED' as const,
      evidenceRef: `fcr://dry-run/${runtimeSha}/bounded-intake`,
    },
    audit: {
      status: 'COMPLETED' as const,
      evidenceRef: `fcr://dry-run/${runtimeSha}/contract-evaluation`,
    },
    delivery: {
      status: 'SIMULATED' as const,
      evidenceRef: `fcr://dry-run/${runtimeSha}/delivery-boundary-simulation`,
      customerEvidenceRef: null,
    },
  };

  const receipt = evaluateFounderProofAuditLifecycle(lifecycleInput);
  if (receipt.contract !== FOUNDER_PROOF_AUDIT_LIFECYCLE_CONTRACT
      || receipt.disposition !== 'DRY_RUN_VERIFIED'
      || receipt.highestTruthPlane !== 'AUDIT_EXECUTION'
      || receipt.claims.commerceExecutionObserved
      || receipt.claims.commercePaymentVerified
      || !receipt.claims.auditExecutionVerified
      || !receipt.claims.deliverySimulationVerified
      || receipt.claims.deliveryOutcomeVerified
      || receipt.claims.customerReceiptAcknowledged
      || receipt.claims.customerValueOutcomeVerified
      || receipt.authority.canMutateProduction
      || receipt.authority.canBypassAccessControls
      || receipt.authority.canExpandScope) {
    throw new Error('FOUNDER_PROOF_AUDIT_DRY_RUN_INVARIANT_DRIFT');
  }

  const inputFingerprint = fingerprint(lifecycleInput);
  return Object.freeze({
    contract: FOUNDER_PROOF_AUDIT_INTERNAL_DRY_RUN_CONTRACT,
    runtimeSha,
    testCase: 'founder-proof-audit-lifecycle-smoke' as const,
    sourceEventId: `${FOUNDER_PROOF_AUDIT_INTERNAL_DRY_RUN_CONTRACT}:${runtimeSha}`,
    inputFingerprint,
    receipt,
    guarantees: Object.freeze({
      shopifyOrderPerformed: false as const,
      shopifyPaymentPerformed: false as const,
      customerDeliveryPerformed: false as const,
      auditedTargetMutationPerformed: false as const,
      receiptPersistenceOnly: true as const,
    }),
  });
}

export function founderProofAuditDryRunEventMetadata(
  dryRun: FounderProofAuditInternalDryRun,
): Record<string, unknown> {
  return {
    contract: dryRun.contract,
    runtimeSha: dryRun.runtimeSha,
    testCase: dryRun.testCase,
    inputFingerprint: dryRun.inputFingerprint,
    receipt: dryRun.receipt,
    guarantees: dryRun.guarantees,
  };
}

const defaultStore: FounderProofAuditDryRunStore = {
  async persist(dryRun) {
    const { supabase } = await import('../lib/supabaseClient.js');
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('slug', FCR_PROJECT_SLUG)
      .eq('status', 'active')
      .maybeSingle();

    if (projectError) throw new Error('founder_proof_audit_project_lookup_failed');
    if (!project?.id) throw new Error('founder_proof_audit_project_not_found');

    const metadata = founderProofAuditDryRunEventMetadata(dryRun);
    const { error } = await supabase.from('project_events').insert({
      project_id: project.id,
      source_event_id: dryRun.sourceEventId,
      event_type: EVENT_TYPE,
      severity: 'info',
      screen: 'founder-proof-audit',
      provider: null,
      decision: null,
      metadata,
    });

    if (!error) return { disposition: 'stored' as const, projectId: project.id };
    if ((error as { code?: string }).code !== '23505') {
      throw new Error('founder_proof_audit_receipt_store_failed');
    }

    const { data: existing, error: lookupError } = await supabase
      .from('project_events')
      .select('metadata')
      .eq('project_id', project.id)
      .eq('source_event_id', dryRun.sourceEventId)
      .maybeSingle();

    if (lookupError) throw new Error('founder_proof_audit_receipt_duplicate_lookup_failed');
    return {
      disposition: sameMetadata(existing?.metadata, metadata) ? 'duplicate' as const : 'conflict' as const,
      projectId: project.id,
    };
  },
};

export async function runFounderProofAuditInternalDryRun(
  runtimeSha: string,
  store: FounderProofAuditDryRunStore = defaultStore,
): Promise<FounderProofAuditInternalDryRunResult> {
  const dryRun = createFounderProofAuditInternalDryRun(runtimeSha);
  const persisted = await store.persist(dryRun);
  return {
    dryRun,
    persistence: persisted.disposition,
    projectId: persisted.projectId,
  };
}
