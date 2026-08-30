import { describe, expect, it } from 'vitest';
import {
  createFounderControlDecision,
  founderControlExecutionEnvelope,
  validateFounderControlDecision,
  type FounderControlProposalBinding,
} from '../founderControlDecision.js';

const proposal: FounderControlProposalBinding = {
  proposalId: 'proposal-123',
  proposalHash: 'a'.repeat(64),
  projectSlug: 'founder-control-room',
  actionType: 'publish-approved-content',
  expectedHeadSha: 'b'.repeat(40),
  capabilityPlanHash: 'c'.repeat(64),
};

describe('founder control decision contract', () => {
  it.each(['fcr', 'chatgpt', 'claude', 'perplexity', 'manus'] as const)(
    'accepts explicit founder approval relayed from %s',
    (surface) => {
      const decision = createFounderControlDecision({ proposal, surface, decision: 'approved' });
      expect(decision.executionAuthorized).toBe(true);
      expect(validateFounderControlDecision(decision, proposal)).toEqual([]);
      expect(founderControlExecutionEnvelope(decision, proposal, 'n8n')).toMatchObject({
        orchestrator: 'n8n',
        executionAuthorized: true,
        receiptRequired: true,
        founderDecisionHash: decision.decisionHash,
      });
      expect(founderControlExecutionEnvelope(decision, proposal, 'zapier').orchestrator).toBe('zapier');
    },
  );

  it.each(['rejected', 'change_requested'] as const)('never authorizes execution for %s', (decisionValue) => {
    const decision = createFounderControlDecision({
      proposal,
      surface: 'chatgpt',
      decision: decisionValue,
    });
    expect(decision.executionAuthorized).toBe(false);
    expect(() => founderControlExecutionEnvelope(decision, proposal, 'n8n'))
      .toThrow('exact founder approval is required before execution');
  });

  it('invalidates approval when the proposal changes after approval', () => {
    const decision = createFounderControlDecision({ proposal, surface: 'claude', decision: 'approved' });
    const changed = { ...proposal, proposalHash: 'd'.repeat(64) };
    expect(validateFounderControlDecision(decision, changed))
      .toContain('founder decision does not bind the exact proposal identity');
    expect(() => founderControlExecutionEnvelope(decision, changed, 'zapier'))
      .toThrow('founder decision does not bind the exact proposal identity');
  });

  it('rejects malformed evidence bindings instead of guessing', () => {
    expect(() => createFounderControlDecision({
      proposal: { ...proposal, proposalHash: '' },
      surface: 'perplexity',
      decision: 'approved',
    })).toThrow('proposalHash must be a 64-character SHA-256 hash');
  });

  it('detects a forged executionAuthorized flag', () => {
    const decision = createFounderControlDecision({ proposal, surface: 'chatgpt', decision: 'rejected' });
    const forged = { ...decision, executionAuthorized: true };
    expect(validateFounderControlDecision(forged, proposal))
      .toContain('execution authorization does not match founder decision');
  });
});
