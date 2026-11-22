import {
  createOperatorContinuityReceiptV2,
  createOperatorExecutionContinuation,
  validateOperatorExecutionContinuation,
  type OperatorExecutionContinuation,
} from './operatorContinuity.js';

export const OPERATOR_CONTINUATION_STORAGE_CONTRACT =
  'fcr/operator-execution-continuation-store@v1' as const;

export class OperatorContinuationStoreError extends Error {
  constructor(public readonly code: 'invalid_continuation' | 'project_not_found' | 'storage_unavailable' | 'stale_continuation') {
    super(code);
  }
}

export interface PersistedOperatorContinuation {
  record: OperatorExecutionContinuation;
  id: string;
  storedAt: string;
  invalidatedAt: string | null;
  status: 'PERSISTED_NOT_REVALIDATED';
  authorizesExecution: false;
}

export type OperatorContinuationStoreDisposition = 'stored' | 'duplicate';

function validTaskId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(value);
}

function parsedStoredRow(row: Record<string, unknown> | null): PersistedOperatorContinuation | null {
  if (!row) return null;
  const state = row.execution_state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new OperatorContinuationStoreError('storage_unavailable');
  }
  const record = state as OperatorExecutionContinuation;
  if (validateOperatorExecutionContinuation(record).length > 0) {
    throw new OperatorContinuationStoreError('storage_unavailable');
  }
  if (row.subject_fingerprint !== record.observation.fingerprint
    || row.proof_cookie !== record.fingerprint
    || row.task_id !== record.taskId
    || typeof row.checkpoint_observed_at !== 'string'
    || Date.parse(row.checkpoint_observed_at) !== Date.parse(record.observation.observedAt)
    || typeof row.id !== 'string'
    || typeof row.created_at !== 'string'
  ) {
    throw new OperatorContinuationStoreError('storage_unavailable');
  }
  return {
    record,
    id: row.id,
    storedAt: row.created_at,
    invalidatedAt: typeof row.invalidated_at === 'string' ? row.invalidated_at : null,
    status: 'PERSISTED_NOT_REVALIDATED',
    authorizesExecution: false,
  };
}

async function projectFor(projectSlug: string, repositoryFullName: string): Promise<string> {
  const { supabase } = await import('./supabaseClient.js');
  const { data, error } = await supabase.from('projects')
    .select('id,repo_identifier')
    .eq('slug', projectSlug)
    .maybeSingle();

  if (error) throw new OperatorContinuationStoreError('storage_unavailable');
  // Cross-project references must never be resolved using only a caller's task ID.
  if (!data || typeof data.id !== 'string'
    || typeof data.repo_identifier !== 'string'
    || data.repo_identifier.toLowerCase() !== repositoryFullName.toLowerCase()
  ) {
    throw new OperatorContinuationStoreError('project_not_found');
  }
  return data.id;
}

async function latestFor(projectId: string, taskId: string): Promise<PersistedOperatorContinuation | null> {
  const { supabase } = await import('./supabaseClient.js');
  const { data, error } = await supabase.from('continuity_records')
    .select('id,task_id,execution_state,subject_fingerprint,proof_cookie,checkpoint_observed_at,invalidated_at,created_at')
    .eq('project_id', projectId)
    .eq('task_id', taskId)
    .order('checkpoint_observed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new OperatorContinuationStoreError('storage_unavailable');
  return parsedStoredRow(data as Record<string, unknown> | null);
}

/**
 * Founder-only database adapter for existing public.continuity_records.
 * A write records historical pointers, not checked-out conversation content
 * and never a reusable approval, current-head proof, or execution permit.
 */
export async function storeOperatorExecutionContinuation(
  record: OperatorExecutionContinuation,
): Promise<{ disposition: OperatorContinuationStoreDisposition; stored: PersistedOperatorContinuation }> {
  if (validateOperatorExecutionContinuation(record).length > 0) {
    throw new OperatorContinuationStoreError('invalid_continuation');
  }
  // Reconstruct the known schema before persistence; never retain arbitrary
  // caller-supplied extra fields (including hidden transcript/secret payloads).
  const safeRecord = createOperatorExecutionContinuation({
    ...record,
    observation: createOperatorContinuityReceiptV2(record.observation),
  });
  // A client with a fast or corrupted clock must not make its observation
  // permanently newer than legitimate follow-up checkpoints.
  if (Date.parse(safeRecord.observation.observedAt) > Date.now() + 5 * 60_000) {
    throw new OperatorContinuationStoreError('invalid_continuation');
  }
  const projectId = await projectFor(safeRecord.observation.projectSlug, safeRecord.observation.repositoryFullName);
  const existing = await latestFor(projectId, safeRecord.taskId);
  const incomingState = safeRecord.taskState ?? 'ACTIVE';
  if (!existing && incomingState !== 'ACTIVE') {
    throw new OperatorContinuationStoreError('invalid_continuation');
  }
  if (existing) {
    const prior = existing.record;
    const priorObservedAt = Date.parse(prior.observation.observedAt);
    const incomingObservedAt = Date.parse(safeRecord.observation.observedAt);
    if (priorObservedAt > incomingObservedAt
      || (priorObservedAt === incomingObservedAt && prior.fingerprint !== safeRecord.fingerprint)) {
      throw new OperatorContinuationStoreError('stale_continuation');
    }
    if (existing.invalidatedAt) {
      const priorRefs = [...prior.observation.evidenceRefs].sort().join('|');
      const nextRefs = [...safeRecord.observation.evidenceRefs].sort().join('|');
      if (incomingObservedAt <= priorObservedAt || priorRefs === nextRefs) {
        throw new OperatorContinuationStoreError('stale_continuation');
      }
    }
    if (prior.fingerprint === safeRecord.fingerprint && priorObservedAt === incomingObservedAt) {
      if (existing.invalidatedAt) throw new OperatorContinuationStoreError('stale_continuation');
      return { disposition: 'duplicate', stored: existing };
    }
    const priorState = prior.taskState ?? 'ACTIVE';
    const allowed: Record<string, readonly string[]> = {
      ACTIVE: ['ACTIVE', 'RESULT_SUBMITTED'],
      RESULT_SUBMITTED: ['RESULT_SUBMITTED', 'VERIFIED'],
      VERIFIED: ['VERIFIED', 'CLOSED'],
      CLOSED: [],
    };
    if (!allowed[priorState]?.includes(incomingState)) {
      throw new OperatorContinuationStoreError('stale_continuation');
    }
    if (prior.destinationOperator && safeRecord.sourceOperator !== prior.destinationOperator) {
      throw new OperatorContinuationStoreError('stale_continuation');
    }
    if (incomingState === 'RESULT_SUBMITTED'
      && safeRecord.resultSubmittedByOperator !== safeRecord.sourceOperator) {
      throw new OperatorContinuationStoreError('invalid_continuation');
    }
    if (incomingState === 'VERIFIED') {
      if (priorState !== 'RESULT_SUBMITTED' && priorState !== 'VERIFIED') {
        throw new OperatorContinuationStoreError('stale_continuation');
      }
      if (safeRecord.resultRef !== prior.resultRef
        || safeRecord.resultSubmittedByOperator !== prior.resultSubmittedByOperator
        || safeRecord.verifiedByOperator !== safeRecord.sourceOperator
        || safeRecord.verifiedByOperator === safeRecord.resultSubmittedByOperator) {
        throw new OperatorContinuationStoreError('invalid_continuation');
      }
    }
    if (incomingState === 'CLOSED') {
      if (priorState !== 'VERIFIED'
        || safeRecord.resultRef !== prior.resultRef
        || safeRecord.resultSubmittedByOperator !== prior.resultSubmittedByOperator
        || safeRecord.verifiedByOperator !== prior.verifiedByOperator
        || JSON.stringify(safeRecord.verificationRefs ?? []) !== JSON.stringify(prior.verificationRefs ?? [])) {
        throw new OperatorContinuationStoreError('stale_continuation');
      }
    }
  }

  const { supabase } = await import('./supabaseClient.js');
  const { data, error } = await supabase.from('continuity_records')
    .insert({
      project_id: projectId,
      task_id: safeRecord.taskId,
      checkpoint_observed_at: safeRecord.observation.observedAt,
      execution_state: safeRecord,
      subject_fingerprint: safeRecord.observation.fingerprint,
      proof_cookie: safeRecord.fingerprint,
      authority_fingerprint: safeRecord.observation.authorityFingerprint,
      runtime_fingerprint: safeRecord.observation.runtimeFingerprint,
      evidence_fingerprint: safeRecord.observation.proofFingerprint,
      valid_until: null, // Unverified handoff never extends the canonical truth lease.
    })
    .select('id,task_id,execution_state,subject_fingerprint,proof_cookie,checkpoint_observed_at,invalidated_at,created_at')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      // Concurrent same-version submission: check actual authoritative row,
      // never report success for a conflicting version.
      const raced = await latestFor(projectId, safeRecord.taskId);
      if (raced?.record.fingerprint === safeRecord.fingerprint
        && raced.record.observation.observedAt === safeRecord.observation.observedAt) {
        return { disposition: 'duplicate', stored: raced };
      }
      throw new OperatorContinuationStoreError('stale_continuation');
    }
    throw new OperatorContinuationStoreError('storage_unavailable');
  }
  const stored = parsedStoredRow(data as Record<string, unknown> | null);
  if (!stored) throw new OperatorContinuationStoreError('storage_unavailable');
  return { disposition: 'stored', stored };
}

export async function readOperatorExecutionContinuation(
  projectSlug: string,
  repositoryFullName: string,
  taskId: string,
): Promise<PersistedOperatorContinuation | null> {
  if (!validTaskId(taskId)) throw new OperatorContinuationStoreError('invalid_continuation');
  const projectId = await projectFor(projectSlug, repositoryFullName);
  return latestFor(projectId, taskId);
}


/**
 * Discovery over the existing founder-only continuity ledger.
 * The returned items are bounded metadata, never raw transcripts or current
 * source/CI/deployment proof. Newer rows for one task win within this window.
 */
export async function listRecentOperatorExecutionContinuations(
  projectSlug: string,
  repositoryFullName: string,
  limit = 10,
): Promise<{
  items: Array<{
    taskId: string;
    observedAt: string;
    sourceMode: 'chat' | 'work';
    sourceOperator: string | null;
    destinationOperator: string | null;
    taskState: 'ACTIVE' | 'RESULT_SUBMITTED' | 'VERIFIED' | 'CLOSED';
    remainingStepIds: readonly string[];
    nextActionRef: string | null;
    fingerprint: string;
    invalidatedAt: string | null;
    status: 'PERSISTED_NOT_REVALIDATED' | 'INVALIDATED';
  }>;
  scanned: number;
  boundedWindow: true;
  currentEvidenceVerified: false;
  authorizesExecution: false;
}> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new OperatorContinuationStoreError('invalid_continuation');
  }
  const projectId = await projectFor(projectSlug, repositoryFullName);
  const { supabase } = await import('./supabaseClient.js');
  // Bounded scan avoids a new table/index and never claims exhaustive coverage.
  const { data, error } = await supabase.from('continuity_records')
    .select('id,task_id,execution_state,subject_fingerprint,proof_cookie,checkpoint_observed_at,invalidated_at,created_at')
    .eq('project_id', projectId)
    .not('task_id', 'is', null)
    .order('checkpoint_observed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !Array.isArray(data)) throw new OperatorContinuationStoreError('storage_unavailable');
  const seen = new Set<string>();
  const items: Array<{
    taskId: string;
    observedAt: string;
    sourceMode: 'chat' | 'work';
    sourceOperator: string | null;
    destinationOperator: string | null;
    taskState: 'ACTIVE' | 'RESULT_SUBMITTED' | 'VERIFIED' | 'CLOSED';
    remainingStepIds: readonly string[];
    nextActionRef: string | null;
    fingerprint: string;
    invalidatedAt: string | null;
    status: 'PERSISTED_NOT_REVALIDATED' | 'INVALIDATED';
  }> = [];
  for (const raw of data) {
    const stored = parsedStoredRow(raw as Record<string, unknown>);
    if (!stored) throw new OperatorContinuationStoreError('storage_unavailable');
    const observation = stored.record.observation;
    if (observation.projectSlug !== projectSlug
      || observation.repositoryFullName.toLowerCase() !== repositoryFullName.toLowerCase()
    ) throw new OperatorContinuationStoreError('storage_unavailable');
    if (seen.has(stored.record.taskId)) continue;
    seen.add(stored.record.taskId);
    items.push({
      taskId: stored.record.taskId,
      observedAt: observation.observedAt,
      sourceMode: stored.record.sourceMode,
      sourceOperator: stored.record.sourceOperator ?? null,
      destinationOperator: stored.record.destinationOperator ?? null,
      taskState: stored.record.taskState ?? 'ACTIVE',
      // The newest row per task stays authoritative even when invalidated,
      // so an older superseded row is never resurrected. An invalidated
      // checkpoint is flagged and exposes no actionable next step.
      remainingStepIds: stored.invalidatedAt ? [] : stored.record.remainingStepIds,
      nextActionRef: stored.invalidatedAt ? null : stored.record.nextActionRef,
      fingerprint: stored.record.fingerprint,
      invalidatedAt: stored.invalidatedAt,
      status: stored.invalidatedAt ? 'INVALIDATED' : 'PERSISTED_NOT_REVALIDATED',
    });
    if (items.length === limit) break;
  }
  return {
    items, scanned: data.length, boundedWindow: true,
    currentEvidenceVerified: false, authorizesExecution: false,
  };
}
