import { describe, expect, it } from 'vitest';
import {
  COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT,
  councilSpecialistGoal,
  parseCouncilSpecialistContribution,
} from '../councilSpecialistContribution.js';
import { CouncilLineageError, runCouncilRound } from '../councilRound.js';
import { buildOperatorRelayResponse } from '../operatorRelayProviderResult.js';

const NOW = () => new Date('2026-11-01T20:00:00.000Z');

const binding = {
  role: 'Evidence Challenger',
  domain: 'cross-provider-drift',
};

function contribution(overrides: Record<string, unknown> = {}) {
  return {
    contract: COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT,
    role: binding.role,
    domain: binding.domain,
    position: 'conditional',
    conclusion: 'The source and runtime claims diverge.',
    recommendation: 'Reconcile the exact provider state before promotion.',
    assumptions: ['The supplied evidence packet is current.'],
    confidence: 82,
    risks: ['A stale provider readback could reverse the conclusion.'],
    dependencies: ['Fresh provider readback.'],
    ...overrides,
  };
}

describe('Council specialist contribution bridge', () => {
  it('adds a bounded report contract without letting the model supply operational reality', () => {
    const goal = councilSpecialistGoal('Challenge this implementation.', binding);
    expect(goal).toContain(COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT);
    expect(goal).toContain('Operational reality is supplied separately by Founder Control Room evidence ingestion');

    const parsed = parseCouncilSpecialistContribution(JSON.stringify(contribution()), binding);
    expect(parsed.domain).toBe('cross-provider-drift');
    expect(parsed.position).toBe('conditional');

    expect(() => parseCouncilSpecialistContribution(JSON.stringify(contribution({
      reality: [{ state: 'verified', statement: 'invented' }],
    })), binding)).toThrow('specialist contribution cannot carry reality');
  });

  it('persists a structured specialist contribution on the exact provider hop', async () => {
    const row = await runCouncilRound({
      goal: 'Challenge this implementation.',
      initiator: 'fcr',
      sourceRef: 'chief-ingestion:ingestion-123',
      seed: 'Evidence packet fingerprint abc123.',
      seats: [{
        operator: 'muse',
        capability: 'propose',
        specialist: binding,
      }],
      now: NOW,
    }, {
      muse: async (request) => {
        expect(request.goal).toContain(COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT);
        return buildOperatorRelayResponse(request, {
          answer: JSON.stringify(contribution()),
          evidenceRefs: ['provider:meta:resp-muse-1'],
          completedAt: '2026-11-01T20:00:01.000Z',
        });
      },
    });

    expect(row.transcript.state).toBe('complete');
    expect(row.transcript.hops[0].specialistContribution).toMatchObject({
      role: 'Evidence Challenger',
      domain: 'cross-provider-drift',
      confidence: 82,
    });
    expect(row.transcript.hops[0].liveProviderEvidence).toBe(true);
  });

  it('fails closed on malformed contribution and on resume seat rebinding', async () => {
    const interrupted = await runCouncilRound({
      goal: 'Challenge this implementation.',
      initiator: 'fcr',
      seed: 'Evidence packet.',
      seats: [{
        operator: 'muse',
        capability: 'propose',
        specialist: binding,
      }],
      now: NOW,
    }, {
      muse: async (request) => buildOperatorRelayResponse(request, {
        answer: '{"not":"a specialist report"}',
        evidenceRefs: ['provider:meta:resp-muse-bad'],
        completedAt: '2026-11-01T20:00:01.000Z',
      }),
    });

    expect(interrupted.transcript.state).toBe('interrupted');
    expect(interrupted.transcript.hops).toHaveLength(0);
    expect(interrupted.transcript.interruption?.reason).toContain('contract mismatch');

    const complete = await runCouncilRound({
      goal: 'Challenge this implementation.',
      initiator: 'fcr',
      seed: 'Evidence packet.',
      seats: [{
        operator: 'muse',
        capability: 'propose',
        specialist: binding,
      }],
      now: NOW,
    }, {
      muse: async (request) => buildOperatorRelayResponse(request, {
        answer: JSON.stringify(contribution()),
        evidenceRefs: ['provider:meta:resp-muse-ok'],
        completedAt: '2026-11-01T20:00:02.000Z',
      }),
    });

    await expect(runCouncilRound({
      goal: 'Challenge this implementation.',
      initiator: 'fcr',
      seed: 'Evidence packet.',
      seats: [{
        operator: 'muse',
        capability: 'propose',
        specialist: { role: 'Different Role', domain: 'cross-provider-drift' },
      }],
      now: NOW,
      resumeFrom: complete.transcript,
    }, {})).rejects.toBeInstanceOf(CouncilLineageError);
  });
});
