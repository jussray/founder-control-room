import { describe, expect, it } from 'vitest';
import {
  buildCouncilWitnessPacket,
  exactCouncilSourceRef,
  sameCouncilWitnessSubject,
  type CouncilWitnessSubject,
} from '../councilWitnessPacket.js';

const HEAD = 'a'.repeat(40);

function subject(overrides: Partial<CouncilWitnessSubject> = {}): CouncilWitnessSubject {
  return {
    projectId: 'project-1',
    projectName: 'Founder Control Room',
    projectSlug: 'founder-control-room',
    repository: 'jussray/founder-control-room',
    branch: 'mission/test',
    headSha: HEAD,
    ...overrides,
  };
}

function relay(state: 'complete' | 'interrupted' = 'complete') {
  const source = subject();
  return {
    mission_id: 'mission-1',
    round: 2,
    participants: ['fcr', 'codex'],
    transcript: {
      contract: 'fcr.council-round.v1',
      goal: 'Challenge the evidence.',
      initiator: 'fcr',
      sourceRef: exactCouncilSourceRef(source),
      seedSha256: 'b'.repeat(64),
      hops: state === 'complete' ? [{
        index: 0,
        relayId: 'relay-1',
        fromOperator: 'fcr',
        toOperator: 'codex',
        capability: 'propose',
        requestHash: 'c'.repeat(64),
        responseHash: 'd'.repeat(64),
        status: 'completed',
        inputSha256: 'e'.repeat(64),
        answerSha256: 'f'.repeat(64),
        answer: 'bounded answer',
        evidenceRefs: ['provider:openai:r1'],
        liveProviderEvidence: true,
        completedAt: '2026-10-06T05:00:01.000Z',
      }] : [],
      humanRelay: false,
      state,
      nextSeatIndex: state === 'complete' ? 1 : 0,
      interruption: state === 'complete' ? null : {
        seatIndex: 0,
        operator: 'codex',
        reason: 'provider unavailable',
        status: null,
        requestHash: null,
        responseHash: null,
        evidenceRefs: [],
        liveProviderEvidence: false,
      },
    },
    outcome: state === 'complete' ? 'bounded answer' : 'interrupted at seat 0',
  } as any;
}

describe('Council witness packet', () => {
  it('binds a completed Council execution receipt to the exact repository subject', () => {
    const packet = buildCouncilWitnessPacket({
      missionId: 'mission-1',
      goal: 'Challenge the evidence.',
      round: 2,
      relay: relay('complete'),
      subject: subject(),
      observedAt: new Date('2026-10-06T05:10:00Z'),
    });

    expect(packet.repository).toBe('jussray/founder-control-room');
    expect(packet.branch).toBe('mission/test');
    expect(packet.headSha).toBe(HEAD);
    expect(packet.expiresAt).toBe('2026-10-06T05:25:00.000Z');
    expect(packet.witnesses.map((w) => [w.class, w.status])).toEqual([
      ['repository_source', 'VERIFIED'],
      ['execution_receipt', 'VERIFIED'],
    ]);
    expect(packet.witnesses[1].evidenceRef).toMatch(/^fcr:council:mission-1:round:2:[0-9a-f]{64}$/);
  });

  it('preserves an interrupted Council round as BLOCKED instead of upgrading it', () => {
    const packet = buildCouncilWitnessPacket({
      missionId: 'mission-1',
      goal: 'Challenge the evidence.',
      round: 2,
      relay: relay('interrupted'),
      subject: subject(),
      observedAt: new Date('2026-10-06T05:10:00Z'),
    });

    expect(packet.witnesses[1].status).toBe('BLOCKED');
    expect(packet.witnesses[1].claim).toContain('interrupted at seat 0');
  });

  it('rejects a Council transcript that was not run against the exact sourceRef', () => {
    const value = relay('complete');
    value.transcript.sourceRef = 'founder-attested:loose-ref';

    expect(() => buildCouncilWitnessPacket({
      missionId: 'mission-1',
      goal: 'Challenge the evidence.',
      round: 2,
      relay: value,
      subject: subject(),
    })).toThrow(/not bound to the exact evidence subject/);
  });

  it('compares evidence subjects by exact repository, ref, and head identity', () => {
    expect(sameCouncilWitnessSubject(subject(), subject())).toBe(true);
    expect(sameCouncilWitnessSubject(subject(), subject({ headSha: '9'.repeat(40) }))).toBe(false);
    expect(sameCouncilWitnessSubject(subject(), subject({ branch: 'main' }))).toBe(false);
  });
});
