import { createHash } from 'node:crypto';
import type {
  ExecutionAuthorization,
  GovernedActionRequest,
  GovernedActionVerdict,
  IntentSource,
  MemorySource,
} from './governedIntelligence.js';
import {
  evaluateTruthLeaseAtUse,
  type TruthDependencyObservation,
  type TruthLease,
  type TruthUseBoundary,
} from '../lib/truthLease.js';

export interface DecisionContextSnapshot {
  intent: {
    id: string;
    hash: string;
    source: IntentSource;
  };
  memories: Array<{
    id: string;
    factHash: string;
    source: MemorySource;
  }>;
  proofs: Array<{
    id: string;
    artifactHash: string;
    exactVersion: string | null;
  }>;
  exactVersion: string | null;
}

export type ContextBoundExecutionAuthorization = ExecutionAuthorization & {
  decisionContext?: DecisionContextSnapshot | null;
  truthLeaseHash?: string | null;
};

export type ContextBoundGovernedActionRequest = Omit<GovernedActionRequest, 'authorization'> & {
  authorization?: ContextBoundExecutionAuthorization | null;
  truthLease?: TruthLease | null;
  truthObservations?: TruthDependencyObservation[];
  truthUseBoundary?: TruthUseBoundary | null;
};

function normalizeSnapshot(snapshot: DecisionContextSnapshot): DecisionContextSnapshot {
  return {
    intent: {
      id: snapshot.intent.id,
      hash: snapshot.intent.hash,
      source: snapshot.intent.source,
    },
    memories: snapshot.memories
      .map((memory) => ({ id: memory.id, factHash: memory.factHash, source: memory.source }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    proofs: snapshot.proofs
      .map((proof) => ({ id: proof.id, artifactHash: proof.artifactHash, exactVersion: proof.exactVersion }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    exactVersion: snapshot.exactVersion,
  };
}

export function decisionContextHash(snapshot: DecisionContextSnapshot): string {
  return createHash('sha256')
    .update(JSON.stringify({ kind: 'fcr/governed-decision-context@v1', context: normalizeSnapshot(snapshot) }))
    .digest('hex');
}

function reasonsBeforeContextGate(verdict: GovernedActionVerdict): string[] {
  return verdict.reasons.filter((reason) => reason !== 'Governed action contract satisfied.');
}

function reconfirmBinding(verdict: GovernedActionVerdict, reason: string): GovernedActionVerdict {
  return {
    ...verdict,
    decision: 'reconfirm',
    reasons: [...reasonsBeforeContextGate(verdict), reason],
    reasonCodes: ['execution_authorization_binding'],
  };
}

export function decisionContextFromVerdict(
  request: ContextBoundGovernedActionRequest,
  verdict: GovernedActionVerdict,
): DecisionContextSnapshot | null {
  if (!verdict.selectedIntent) return null;

  const memoriesById = new Map((request.memories ?? []).map((memory) => [memory.id, memory]));
  const proofsById = new Map((request.proofs ?? []).map((proof) => [proof.id, proof]));
  const memoryIds = [...new Set(verdict.lineage.memoryIds)].sort();
  const proofIds = [...new Set(verdict.lineage.proofIds)].sort();

  const memories = memoryIds.map((id) => memoriesById.get(id));
  const proofs = proofIds.map((id) => proofsById.get(id));
  if (memories.some((memory) => !memory) || proofs.some((proof) => !proof)) return null;

  return normalizeSnapshot({
    intent: {
      id: verdict.selectedIntent.id,
      hash: verdict.selectedIntent.intentHash,
      source: verdict.selectedIntent.source,
    },
    memories: memories.map((memory) => ({
      id: memory!.id,
      factHash: memory!.factHash,
      source: memory!.source,
    })),
    proofs: proofs.map((proof) => ({
      id: proof!.id,
      artifactHash: proof!.artifactHash,
      exactVersion: proof!.exactVersion ?? null,
    })),
    exactVersion: request.exactVersion ?? null,
  });
}

export function decisionContextsMatch(
  approved: DecisionContextSnapshot,
  current: DecisionContextSnapshot,
): boolean {
  return JSON.stringify(normalizeSnapshot(approved)) === JSON.stringify(normalizeSnapshot(current));
}

export function enforceConsequentialDecisionContext(
  request: ContextBoundGovernedActionRequest,
  verdict: GovernedActionVerdict,
  effectiveRisk: GovernedActionRequest['risk'],
): GovernedActionVerdict {
  if (effectiveRisk !== 'consequential' || verdict.decision !== 'allow') return verdict;

  const approved = request.authorization?.decisionContext ?? null;
  const current = decisionContextFromVerdict(request, verdict);

  if (!approved || !current) {
    return reconfirmBinding(
      verdict,
      'Consequential portfolio action requires execution authorization bound to the exact decision context.',
    );
  }

  if (!decisionContextsMatch(approved, current)) {
    return reconfirmBinding(
      verdict,
      'Execution authorization decision context no longer matches current intent, memory, proof, or exact version; regenerate the proposal or re-confirm it against current state.',
    );
  }

  const dependsOnObservedTruth = current.memories.length > 0 || current.proofs.length > 0;
  if (!dependsOnObservedTruth) return verdict;

  const lease = request.truthLease ?? null;
  const useBoundary = request.truthUseBoundary ?? null;
  if (!lease || !useBoundary) {
    return reconfirmBinding(
      verdict,
      'Evidence-dependent consequential action requires a Truth Lease revalidated at the exact use boundary.',
    );
  }

  const currentContextHash = decisionContextHash(current);
  if (lease.claimHash.toLowerCase() !== currentContextHash) {
    return reconfirmBinding(
      verdict,
      'Truth Lease does not bind the exact current decision context; rebuild the lease from current evidence.',
    );
  }

  const authorizedLeaseHash = request.authorization?.truthLeaseHash?.trim().toLowerCase() ?? null;
  if (authorizedLeaseHash !== lease.leaseHash.toLowerCase()) {
    return reconfirmBinding(
      verdict,
      'Execution authorization is bound to a different Truth Lease.',
    );
  }

  try {
    const leaseEvaluation = evaluateTruthLeaseAtUse({
      lease,
      observations: request.truthObservations ?? [],
      useBoundary,
      now: verdict.lineage.evaluatedAt,
    });
    if (!leaseEvaluation.mayUseClaim) {
      return reconfirmBinding(
        verdict,
        `Truth Lease is ${leaseEvaluation.state} at ${useBoundary}; ${leaseEvaluation.reasons.join('; ')}`,
      );
    }
  } catch {
    return reconfirmBinding(
      verdict,
      'Truth Lease could not be validated at the use boundary.',
    );
  }

  return verdict;
}
