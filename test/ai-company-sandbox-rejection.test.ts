import { describe, expect, it } from 'vitest';
import type { FounderOsLabRequest } from '../src/founder-os-lab/contracts.js';
import { runFounderOsSandbox } from '../src/founder-os-lab/sandbox.js';
// The isolated JavaScript lab intentionally exposes no generated TS declarations.
// @ts-expect-error Runtime rejection behavior is exercised directly.
import { runAdversarialSimulation } from '../labs/ai-company/src/adversarial.mjs';
// @ts-expect-error Runtime rejection behavior is exercised directly.
import { runCompanySandbox } from '../labs/ai-company/src/sandbox.mjs';

const PROOF_URL = 'https://proof.example.test/sandbox-rejection';

function companyInput() {
  return {
    dataClassification: 'synthetic',
    projectSlug: 'synthetic-founder-project',
    eventId: 'synthetic-sandbox-rejection',
    summary: 'A synthetic malformed-input rejection scenario.',
    requestedMode: 'draft',
    audiences: ['founders'],
    platforms: ['linkedin'],
    proof: {
      projectSlug: 'synthetic-founder-project',
      status: 'ready',
      urls: [PROOF_URL],
    },
    traction: [
      {
        label: 'Synthetic rejection coverage',
        value: 'malformed input blocked',
        sourceUrl: PROOF_URL,
      },
    ],
    governanceAdvantages: [
      {
        label: 'Exceptions become sealed rejection verdicts',
        proofUrl: PROOF_URL,
      },
    ],
    founderApprovalId: null,
  };
}

function adversarialEnvelope() {
  return {
    dataClassification: 'synthetic',
    killSwitch: false,
    requestedAuthority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
    },
    approvalScope: {
      id: 'synthetic-approval-rejection',
      projectSlug: 'synthetic-founder-project',
      eventId: 'synthetic-sandbox-rejection',
      mode: 'draft',
    },
    consumedApprovalIds: [],
    observedAt: '2026-08-01T16:00:00.000Z',
    proofObservedAt: '2026-08-01T15:00:00.000Z',
    delegationChain: ['juss-chief-ai', 'governance-agent'],
    agentVotes: [
      { agent: 'reality-agent', decision: 'allow' },
      { agent: 'governance-agent', decision: 'allow' },
    ],
    budget: { steps: 4, costUnits: 20, elapsedMs: 500 },
    seenCampaignKeys: [],
    prompt: 'Evaluate one malformed synthetic payload.',
    companyInput: companyInput(),
  };
}

describe('sandbox malformed-input rejection', () => {
  it('returns a sealed company rejection instead of leaking a simulator exception', () => {
    const malformed: Record<string, unknown> = companyInput();
    malformed.projectSlug = 42;

    const run = runCompanySandbox(malformed);

    expect(run).toMatchObject({
      status: 'blocked',
      simulatorInvoked: true,
      violations: ['simulation_input_rejected'],
      result: null,
    });
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.sandbox)).toBe(true);
  });

  it('returns a sealed Founder OS rejection instead of leaking a planner exception', () => {
    const malformed = {
      goal: 'Route an unknown synthetic action.',
      action: 'unknown-action',
    } as unknown as FounderOsLabRequest;

    const run = runFounderOsSandbox(malformed);

    expect(run).toMatchObject({
      status: 'blocked',
      plannerInvoked: true,
      violations: ['planner_input_rejected'],
      plan: null,
    });
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.sandbox)).toBe(true);
  });

  it('blocks malformed company fields in adversarial preflight before simulation', () => {
    const envelope = adversarialEnvelope();
    envelope.companyInput.projectSlug = 42 as unknown as string;
    envelope.prompt = { active: true } as unknown as string;
    envelope.approvalScope.id = 7 as unknown as string;

    const run = runAdversarialSimulation(envelope);

    expect(run.status).toBe('blocked');
    expect(run.phase).toBe('preflight');
    expect(run.simulatorInvoked).toBe(false);
    expect(run.blockers).toContain('invalid_company_input');
    expect(run.blockers).toContain('invalid_prompt');
  });
});
