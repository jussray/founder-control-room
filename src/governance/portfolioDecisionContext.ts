import type {
  ExecutionAuthorization,
  GovernedActionRequest,
  GovernedActionVerdict,
  IntentSource,
  MemorySource,
} from './governedIntelligence.js';

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
};

export type ContextBoundGovernedActionRequest = Omit<GovernedActionRequest, 'authorization'> & {
  authorization?: ContextBoundExecutionAuthorization | null;
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

function reasonsBeforeContextGate(verdict: GovernedActionVerdict): string[] {
  return verdict.reasons.filter((reason) => reason !== 'Governed action contract satisfied.');
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
  const baseReasons = reasonsBeforeContextGate(verdict);

  if (!approved || !current) {
    return {
      ...verdict,
      decision: 'reconfirm',
      reasons: [
        ...baseReasons,
        'Consequential portfolio action requires execution authorization bound to the exact decision context.',
      ],
      reasonCodes: ['execution_authorization_binding'],
    };
  }

  if (!decisionContextsMatch(approved, current)) {
    return {
      ...verdict,
      decision: 'reconfirm',
      reasons: [
        ...baseReasons,
        'Execution authorization decision context no longer matches current intent, memory, proof, or exact version; regenerate the proposal or re-confirm it against current state.',
      ],
      reasonCodes: ['execution_authorization_binding'],
    };
  }

  return verdict;
}
