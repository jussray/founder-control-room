import { supabase } from './supabaseClient.js';

const TRUTH_CLASSIFICATIONS = new Set(['verified', 'inferred', 'unknown', 'blocked', 'conflicted', 'stale']);

function normalizeTruthClassification(value: unknown) {
  const candidate = String(value ?? '').trim().toLowerCase();
  return TRUTH_CLASSIFICATIONS.has(candidate) ? candidate : 'unknown';
}

function hasEvidence(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return Boolean(value);
}

function hasRecoveryMode(value: unknown) {
  return Boolean(value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0);
}

export function toProjectShellStateView(raw: {
  truth: any;
  continuity: any;
  outcome: any;
  resources: any[] | null;
  recovery: any;
}, now = new Date()) {
  const classification = normalizeTruthClassification(raw.truth?.classification);
  const truthExpired = Boolean(raw.truth?.expires_at && new Date(raw.truth.expires_at).getTime() <= now.getTime());
  const continuityPresent = Boolean(raw.continuity);
  const continuityValid = continuityPresent
    && !raw.continuity.invalidated_at
    && (!raw.continuity.valid_until || new Date(raw.continuity.valid_until).getTime() > now.getTime());
  const continuityBreaksTruth = continuityPresent && !continuityValid;
  const outcomeHasEvidence = hasEvidence(raw.outcome?.evidence);
  const outcomeAchieved = raw.outcome?.classification === 'achieved';
  const effectiveClassification = (truthExpired || continuityBreaksTruth) && classification === 'verified'
    ? 'stale'
    : classification;

  return {
    available: true as const,
    classification: effectiveClassification,
    reason: raw.truth
      ? truthExpired
        ? 'truth_snapshot_expired'
        : continuityBreaksTruth
          ? 'continuity_invalidated'
          : null
      : 'no_truth_snapshot',
    truth: raw.truth ? {
      observedAt: raw.truth.observed_at ?? null,
      expiresAt: raw.truth.expires_at ?? null,
      conflictCount: Array.isArray(raw.truth.conflicts) ? raw.truth.conflicts.length : 0,
    } : null,
    continuity: {
      present: continuityPresent,
      valid: continuityValid,
      validUntil: raw.continuity?.valid_until ?? null,
      invalidatedAt: raw.continuity?.invalidated_at ?? null,
    },
    outcome: raw.outcome ? {
      classification: raw.outcome.classification ?? 'unknown',
      observedAt: raw.outcome.observed_at ?? null,
      hasEvidence: outcomeHasEvidence,
    } : null,
    resources: (raw.resources ?? []).map((resource) => ({
      type: resource.resource_type,
      unit: resource.unit,
      ceiling: resource.ceiling ?? null,
      consumed: resource.consumed ?? 0,
    })),
    recovery: raw.recovery ? {
      status: raw.recovery.status ?? 'planned',
      modesAvailable: ['rollback', 'retry', 'reconcile', 'compensate', 'abandon'].filter((mode) => hasRecoveryMode(raw.recovery?.[mode])),
    } : null,
    mayClaimVerifiedOutcome: effectiveClassification === 'verified' && outcomeAchieved && outcomeHasEvidence,
  };
}

export async function readProjectShellState(projectId: string) {
  const [truth, continuity, outcome, resources, recovery] = await Promise.all([
    supabase.from('truth_snapshots').select('classification, observed_at, expires_at, conflicts').eq('project_id', projectId).order('observed_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('continuity_records').select('valid_until, invalidated_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('outcomes').select('classification, observed_at, evidence').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('resource_budgets').select('resource_type, unit, ceiling, consumed').eq('project_id', projectId).order('updated_at', { ascending: false }),
    supabase.from('recovery_plans').select('status, rollback, retry, reconcile, compensate, abandon').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const errors = [truth.error, continuity.error, outcome.error, resources.error, recovery.error].filter(Boolean);
  if (errors.length) {
    return {
      available: false as const,
      classification: 'unknown' as const,
      reason: 'canonical_shell_state_unavailable',
      truth: null,
      continuity: { present: false, valid: false, validUntil: null, invalidatedAt: null },
      outcome: null,
      resources: [],
      recovery: null,
      mayClaimVerifiedOutcome: false,
    };
  }

  return toProjectShellStateView({
    truth: truth.data,
    continuity: continuity.data,
    outcome: outcome.data,
    resources: resources.data,
    recovery: recovery.data,
  });
}
