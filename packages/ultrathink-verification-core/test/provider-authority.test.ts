import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '../src/canonical-serialize.js';
import { evaluateProviderAuthorityV0 } from '../src/provider-authority-evaluator.v0.js';
import type { ProviderAuthorityEvaluationInputV0 } from '../src/provider-authority-receipt.v0.js';

const baseline = (): ProviderAuthorityEvaluationInputV0 => ({
  provider: 'github',
  resource: 'jussray/Sekret-Bip',
  target: 'main',
  candidateSha: '579342699fc7fb394cf9684643756cdc8c9342a8',
  observedAt: '2026-08-25T01:45:00Z',
  expectation: {
    requiresChangeRequest: true,
    minimumApprovals: 1,
    requiresFreshApproval: true,
    requiresConversationResolution: true,
    requiresStrictEvidence: true,
    requiredEvidence: ['Repository Truth Gate', 'Control Room Test Ledger'],
    allowedBypassPrincipals: [],
  },
  observation: {
    requiresChangeRequest: true,
    minimumApprovals: 1,
    requiresFreshApproval: true,
    requiresConversationResolution: true,
    requiresStrictEvidence: true,
    requiredEvidence: ['Control Room Test Ledger', 'Repository Truth Gate'],
    bypassPrincipals: [],
  },
  behavior: {
    blockedWithoutApproval: true,
    allowedWithApproval: true,
    staleApprovalBlocked: true,
  },
  evidenceRefs: ['behavior-probe', 'ruleset-readback'],
});

describe('evaluateProviderAuthorityV0', () => {
  it('verifies only when provider state and behavior satisfy the expected authority membrane', () => {
    const receipt = evaluateProviderAuthorityV0(baseline());
    expect(receipt.decision).toEqual({ state: 'VERIFIED', reasons: ['PROVIDER_AUTHORITY_MATCH'] });
  });

  it('classifies a provider that allows zero-approval integration as drift', () => {
    const input = baseline();
    input.behavior.blockedWithoutApproval = false;
    const receipt = evaluateProviderAuthorityV0(input);
    expect(receipt.decision.state).toBe('DRIFT');
    expect(receipt.decision.reasons).toContain('BEHAVIOR_ZERO_APPROVAL_NOT_BLOCKED');
  });

  it('classifies missing provider readback as unknown instead of green', () => {
    const input = baseline();
    input.observation.requiresStrictEvidence = null;
    input.observation.bypassPrincipals = null;
    const receipt = evaluateProviderAuthorityV0(input);
    expect(receipt.decision.state).toBe('UNKNOWN');
    expect(receipt.decision.reasons).toContain('OBSERVATION_STRICT_EVIDENCE_UNKNOWN');
    expect(receipt.decision.reasons).toContain('OBSERVATION_BYPASS_PRINCIPALS_UNKNOWN');
  });

  it('fails closed on unexpected bypass principals', () => {
    const input = baseline();
    input.observation.bypassPrincipals = ['owner'];
    const receipt = evaluateProviderAuthorityV0(input);
    expect(receipt.decision.state).toBe('DRIFT');
    expect(receipt.decision.reasons).toContain('UNEXPECTED_BYPASS_PRINCIPAL:owner');
  });

  it('is byte-identical for semantically identical unordered evidence', () => {
    const forward = baseline();
    const reversed = baseline();
    reversed.expectation.requiredEvidence = [...reversed.expectation.requiredEvidence].reverse();
    reversed.observation.requiredEvidence = [...(reversed.observation.requiredEvidence ?? [])].reverse();
    reversed.evidenceRefs = [...reversed.evidenceRefs].reverse();

    expect(canonicalSerialize(evaluateProviderAuthorityV0(forward)))
      .toBe(canonicalSerialize(evaluateProviderAuthorityV0(reversed)));
  });
});
