import { describe, expect, it } from 'vitest';
import {
  PORTFOLIO_GOVERNANCE_PROFILES,
  evaluatePortfolioGovernedAction,
  portfolioGovernanceProfile,
  portfolioHardConstraintViolations,
} from './portfolioGovernanceProfiles.js';
import {
  decisionContextFromVerdict,
  decisionContextHash,
  type ContextBoundGovernedActionRequest,
} from './portfolioDecisionContext.js';
import { createTruthLease } from '../lib/truthLease.js';
import type {
  ExecutionAuthorization,
  GovernedActionRequest,
  ProofContract,
  RecoveryPlan,
  TemporalIntent,
} from './governedIntelligence.js';

const NOW = new Date('2026-08-17T03:45:00.000Z');
const ARTIFACT_HASH = 'b'.repeat(64);
const PROPOSAL_HASH = 'c'.repeat(64);
const ACTION_HASH = 'd'.repeat(64);

function intent(scope: string): TemporalIntent {
  return { id: `intent-${scope}`, source: 'current_user', scope: [scope], intentHash: `intent-hash-${scope}`, issuedAt: '2026-08-17T03:40:00.000Z', authenticated: true };
}

function authorization(scope: string): ExecutionAuthorization {
  return {
    id: `authorization-${scope}`, actorId: 'founder', source: 'current_user', intentId: `intent-${scope}`, intentHash: `intent-hash-${scope}`,
    proposalId: `proposal-${scope}`, proposalHash: PROPOSAL_HASH, actionHash: ACTION_HASH, scope: [scope], risk: 'consequential',
    issuedAt: '2026-08-17T03:40:00.000Z', expiresAt: '2026-08-17T04:00:00.000Z', authenticated: true,
  };
}

function proof(claim: string): ProofContract {
  return { id: `proof-${claim}`, subject: claim, proves: [claim], doesNotProve: [], artifactHash: ARTIFACT_HASH, verificationMethod: 'test fixture', observedAt: '2026-08-17T03:41:00.000Z', freshForMs: 60 * 60 * 1000 };
}

function recovery(level: RecoveryPlan['level'] = 'R2'): RecoveryPlan {
  return { id: `recovery-${level}`, level, checkpointRef: 'before', rollbackAction: 'restore', validationAction: 'verify restored state' };
}

function request(scope: string, overrides: Partial<GovernedActionRequest> = {}): GovernedActionRequest {
  return {
    requiredScope: scope, risk: 'consequential', intents: [intent(scope)], recoveryPlan: recovery(), proposalId: `proposal-${scope}`,
    proposalHash: PROPOSAL_HASH, actionHash: ACTION_HASH, authorization: authorization(scope), authorizationReplayState: 'unused', now: NOW,
    ...overrides,
  };
}

function bindContextAndLease(input: GovernedActionRequest, repository: string): ContextBoundGovernedActionRequest {
  const firstVerdict = evaluatePortfolioGovernedAction(repository, input.requiredScope, input);
  const snapshot = decisionContextFromVerdict(input, firstVerdict);
  if (!snapshot) return input as ContextBoundGovernedActionRequest;

  const contextHash = decisionContextHash(snapshot);
  const lease = createTruthLease({
    claimHash: contextHash,
    claimClass: 'fcr/governed-decision-context@v1',
    verifiedAt: NOW.toISOString(),
    validUntil: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
    dependencies: [
      {
        key: 'proof:test',
        authority: 'runtime',
        expectedDigest: ARTIFACT_HASH,
        maxObservationAgeMs: 60 * 60 * 1000,
      },
    ],
  });

  return {
    ...input,
    authorization: input.authorization ? {
      ...input.authorization,
      decisionContext: snapshot,
      truthLeaseHash: lease.leaseHash,
    } : null,
    truthLease: lease,
    truthUseBoundary: 'merge',
    truthObservations: [
      {
        key: 'proof:test',
        authority: 'runtime',
        digest: ARTIFACT_HASH,
        observedAt: NOW.toISOString(),
      },
    ],
  } as ContextBoundGovernedActionRequest;
}

describe('active portfolio governance registry', () => {
  it('has unique project ids and repository ownership', () => {
    const ids = PORTFOLIO_GOVERNANCE_PROFILES.map((profile) => profile.id);
    const repositories = PORTFOLIO_GOVERNANCE_PROFILES.flatMap((profile) => profile.repositories.map((repo) => repo.toLowerCase()));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(repositories).size).toBe(repositories.length);
  });

  it('covers every currently governed canonical active repository without double-counting retired demos', () => {
    const repositories = PORTFOLIO_GOVERNANCE_PROFILES.flatMap((profile) => profile.repositories);
    expect(repositories).toEqual(expect.arrayContaining([
      'jussray/founder-control-room', 'jussray/chief-ai-machine', 'jussray/promptos', 'jussray/Sekret-Bip', 'jussray/Se-kretBip',
      'jussray/jussbeautifulhair-site', 'jussray/jbh-private', 'jussray/StoryEngine', 'jussray/solcontinuity', 'jussray/SleepWealth-Agent',
      'jussray/untold-stories-storefront', 'jussray/Sweats',
    ]));
    expect(repositories).not.toContain('jussray/jussbeautifulhair1');
    expect(repositories).not.toContain('jussray/sekret-bip-demo');
  });

  it('keeps public and private JBH repositories under one product governance profile', () => {
    expect(portfolioGovernanceProfile('jussray/jussbeautifulhair-site')?.id).toBe('jussbeautifulhair');
    expect(portfolioGovernanceProfile('jussray/jbh-private')?.id).toBe('jussbeautifulhair');
  });
});

describe('hard portfolio boundaries', () => {
  it('keeps SleepWealth paper-only by rejecting a live trade request before any proof can authorize it', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/SleepWealth-Agent', 'live-trade', request('live-trade'));
    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons.join(' ')).toContain('explicitly blocks action: live-trade');
  });

  it('keeps Bip Jr public social and permission escalation blocked', () => {
    expect(portfolioHardConstraintViolations('jussray/Se-kretBip', 'enable-public-social')).toContain('project profile explicitly blocks action: enable-public-social');
    expect(portfolioHardConstraintViolations('jussray/Se-kretBip', 'expand-child-permissions-without-adult')).toContain('project profile explicitly blocks action: expand-child-permissions-without-adult');
  });

  it('keeps StoryEngine source analysis from auto-promoting canon', () => {
    expect(evaluatePortfolioGovernedAction('jussray/StoryEngine', 'auto-promote-canon', request('auto-promote-canon')).decision).toBe('deny');
  });

  it('keeps SWEATS honest while its runtime remains unimplemented', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/Sweats', 'production-claim', request('production-claim'));
    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons.join(' ')).toContain('no implemented runtime authority');
  });

  it('does not let a caller downgrade FCR deploy from consequential to reversible to skip authorization', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/founder-control-room', 'deploy', request('deploy', {
      risk: 'reversible', proofs: [proof('repository_head_matches_plan'), proof('production_authority_is_singular')], authorization: null,
    }));
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('bound execution authorization');
  });

  it('fails closed when a consequential portfolio action label is not explicitly registered', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/founder-control-room', 'merge-pr', request('merge-pr'));
    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons.join(' ')).toContain('effectful action must be explicitly registered in project profile: merge-pr');
  });

  it('also fails closed when an unknown effectful action is mislabeled reversible', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/founder-control-room', 'mystery-change', request('mystery-change', {
      risk: 'reversible',
      authorization: null,
    }));
    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons.join(' ')).toContain('effectful action must be explicitly registered in project profile: mystery-change');
  });

  it('keeps registered FCR merge bound to its declared project-specific claims', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/founder-control-room', 'merge', request('merge'));
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('repository_head_matches_plan');
  });
});

describe('project-specific proof contracts', () => {
  it('requires both exact runtime and commerce-path proof before Untold can make a production claim', () => {
    const first = evaluatePortfolioGovernedAction('jussray/untold-stories-storefront', 'production_claim', request('production_claim', { proofs: [proof('exact_production_version_verified')] }));
    expect(first.decision).toBe('reconfirm');
    expect(first.reasons.join(' ')).toContain('commerce_path_verified');
    const completeReq = bindContextAndLease(request('production_claim', { proofs: [proof('exact_production_version_verified'), proof('commerce_path_verified')] }), 'jussray/untold-stories-storefront');
    const complete = evaluatePortfolioGovernedAction('jussray/untold-stories-storefront', 'production_claim', completeReq);
    expect(complete.decision).toBe('allow');
  });

  it('requires provider-backed commerce receipt before JBH completion can be claimed', () => {
    const missing = evaluatePortfolioGovernedAction('jussray/jussbeautifulhair-site', 'commerce_completion', request('commerce_completion'));
    expect(missing.decision).toBe('reconfirm');
    expect(missing.reasons.join(' ')).toContain('commerce_provider_receipt_verified');
    const completeReq = bindContextAndLease(request('commerce_completion', { proofs: [proof('commerce_provider_receipt_verified')] }), 'jussray/jussbeautifulhair-site');
    const complete = evaluatePortfolioGovernedAction('jussray/jussbeautifulhair-site', 'commerce_completion', completeReq);
    expect(complete.decision).toBe('allow');
  });

  it('requires creator approval and source lineage for StoryEngine canonization', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/StoryEngine', 'canonize', request('canonize', { proofs: [proof('creator_approval_verified')] }));
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('source_lineage_verified');
  });

  it('rejects an authorization copied from a different portfolio action', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/jussbeautifulhair-site', 'commerce_completion', request('commerce_completion', {
      proofs: [proof('commerce_provider_receipt_verified')], authorization: authorization('production_claim'),
    }));
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasonCodes).toEqual(['execution_authorization_binding']);
    expect(verdict.reasons.join(' ')).toMatch(/different intent|scope does not cover this action/);
  });

  it('fails closed when a consequential portfolio action cannot prove authorization replay state', () => {
    const verdict = evaluatePortfolioGovernedAction('jussray/StoryEngine', 'canonize', request('canonize', {
      proofs: [proof('creator_approval_verified'), proof('source_lineage_verified')], authorizationReplayState: 'unknown',
    }));
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('unused status must be proven');
  });
});
