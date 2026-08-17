import { describe, expect, it } from 'vitest';
import {
  decisionContextsMatch,
  enforceConsequentialDecisionContext,
  type ContextBoundGovernedActionRequest,
  type DecisionContextSnapshot,
} from './portfolioDecisionContext.js';
import type { GovernedActionVerdict, TemporalIntent } from './governedIntelligence.js';

const intent: TemporalIntent = {
  id: 'intent-current',
  source: 'current_user',
  scope: ['execute'],
  intentHash: 'intent-v1',
  issuedAt: '2026-08-17T03:20:00.000Z',
  authenticated: true,
};

function snapshot(): DecisionContextSnapshot {
  return {
    intent: { id: 'intent-current', hash: 'intent-v1', source: 'current_user' },
    memories: [
      { id: 'b', factHash: 'fact-b', source: 'current_user' },
      { id: 'a', factHash: 'fact-a', source: 'provider_evidence' },
    ],
    proofs: [
      { id: 'proof-b', artifactHash: 'b'.repeat(64), exactVersion: 'abc123' },
      { id: 'proof-a', artifactHash: 'a'.repeat(64), exactVersion: 'abc123' },
    ],
    exactVersion: 'abc123',
  };
}

describe('decision context Redteam', () => {
  it('compares semantic fields rather than caller object insertion order', () => {
    const approved = snapshot();
    const reordered = {
      exactVersion: 'abc123',
      proofs: [...approved.proofs].reverse().map((proof) => ({
        exactVersion: proof.exactVersion,
        artifactHash: proof.artifactHash,
        id: proof.id,
      })),
      memories: [...approved.memories].reverse().map((memory) => ({
        source: memory.source,
        factHash: memory.factHash,
        id: memory.id,
      })),
      intent: {
        source: approved.intent.source,
        hash: approved.intent.hash,
        id: approved.intent.id,
      },
    } as DecisionContextSnapshot;

    expect(decisionContextsMatch(approved, reordered)).toBe(true);
  });

  it('does not tell the user a blocked consequential action already satisfied governance', () => {
    const request: ContextBoundGovernedActionRequest = {
      requiredScope: 'execute',
      risk: 'consequential',
      intents: [intent],
    };
    const verdict: GovernedActionVerdict = {
      decision: 'allow',
      reasons: [
        'current_user intent is active, authenticated, scoped, and not legitimately superseded.',
        'Governed action contract satisfied.',
      ],
      reasonCodes: ['allow'],
      selectedIntent: intent,
      lineage: {
        evaluatedAt: '2026-08-17T03:30:00.000Z',
        intentId: intent.id,
        memoryIds: [],
        proofIds: [],
        recoveryPlanId: null,
        authorizationId: null,
        proposalId: null,
        proposalHash: null,
        actionHash: null,
        exactVersion: null,
      },
    };

    const blocked = enforceConsequentialDecisionContext(request, verdict, 'consequential');
    expect(blocked.decision).toBe('reconfirm');
    expect(blocked.reasons).not.toContain('Governed action contract satisfied.');
    expect(blocked.reasons.join(' ')).toContain('exact decision context');
  });
});
