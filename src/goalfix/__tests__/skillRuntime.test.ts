import { describe, expect, it } from 'vitest';
import { buildGoalfixSkillRuntimeDecision } from '../skillRuntime.js';

const BAD_SHA = 'a'.repeat(40);
const CLEAN_SHA = 'b'.repeat(40);

function verifiedCleanBase() {
  return {
    repository: 'jussray/founder-control-room',
    branch: 'main',
    baseSha: CLEAN_SHA,
    status: 'VERIFIED_CLEAN' as const,
    evidenceIds: ['check:goalfix-unit', 'check:goalfix-playwright'],
    verifiedAt: '2026-09-25T09:30:00.000Z',
    repairedFromSha: BAD_SHA,
  };
}

describe('buildGoalfixSkillRuntimeDecision', () => {
  it('permits a scoped confirmed inspection', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Audit the skill artifact against current main.', confirmed: true },
      scope: {
        firstFilesOrLogs: ['src/goalfix/engine.ts', 'src/goalfix/engine.ts', 'package.json'],
        maxInitialReads: 1,
        stopCondition: 'Stop after the focused runtime contract is verified.',
      },
      provenance: {
        artifactSha256: 'abc123',
        sourceName: 'ai-skill-suite.zip',
      },
    });

    expect(decision.mayProceed).toBe(true);
    expect(decision.intent.confirmed).toBe(true);
    expect(decision.scope.firstFilesOrLogs).toEqual(['src/goalfix/engine.ts']);
    expect(decision.scope.maxInitialReads).toBe(1);
    expect(decision.provenance.sourceName).toBe('ai-skill-suite.zip');
    expect(decision.baseGate.status).toBe('NOT_REQUIRED');
  });

  it('deduplicates before applying the read budget', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Inspect only the first two unique sources.', confirmed: true },
      scope: {
        firstFilesOrLogs: ['a.ts', 'a.ts', 'b.ts', 'c.ts'],
        maxInitialReads: 2,
        stopCondition: 'Stop after two unique sources are inspected.',
      },
    });

    expect(decision.scope.firstFilesOrLogs).toEqual(['a.ts', 'b.ts']);
  });

  it('blocks a nonempty raw-only goal without confirmation', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'cont the skill thing' },
      scope: {
        firstFilesOrLogs: ['src/goalfix/engine.ts'],
        maxInitialReads: 1,
        stopCondition: 'Stop after inspection.',
      },
    });

    expect(decision.intent.confidence).toBe('low');
    expect(decision.mayProceed).toBe(false);
    expect(decision.nextAction).toContain('Resolve the founder intent');
  });

  it('blocks a repeated same-signature failure loop', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Repair the exact failing check.', confirmed: true },
      attempts: [
        {
          approach: 'rerun',
          failureSignature: 'runner unavailable',
          filesTouched: [],
          result: 'failed',
        },
        {
          approach: 'rerun again',
          failureSignature: 'Runner unavailable',
          filesTouched: [],
          result: 'blocked',
        },
      ],
      scope: {
        firstFilesOrLogs: ['workflow job'],
        maxInitialReads: 1,
        stopCondition: 'Stop after root-cause evidence exists.',
      },
    });

    expect(decision.mayProceed).toBe(false);
    expect(decision.stagnation.stagnant).toBe(true);
    expect(decision.nextAction).toContain('Stop retrying the same path');
  });

  it('requires a stop condition and clamps the initial read budget', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Inspect the branch.', confirmed: true },
      scope: {
        firstFilesOrLogs: ['package.json'],
        maxInitialReads: 0,
        stopCondition: '   ',
      },
    });

    expect(decision.scope.maxInitialReads).toBe(1);
    expect(decision.mayProceed).toBe(false);
    expect(decision.nextAction).toContain('Define a concrete stop condition');
  });

  it('blocks forward build work when exact base-health evidence is missing', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Continue the queued implementation.', confirmed: true },
      operation: 'build',
      scope: {
        firstFilesOrLogs: ['src/goalfix/skillRuntime.ts'],
        maxInitialReads: 1,
        stopCondition: 'Stop after the queued implementation is verified.',
      },
    });

    expect(decision.mayProceed).toBe(false);
    expect(decision.baseGate.status).toBe('BLOCKED');
    expect(decision.nextAction).toContain('Exact base-health evidence is required');
  });

  it('blocks forward work on a known-bad base instead of building over it', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Continue the queued implementation.', confirmed: true },
      operation: 'build',
      baseHealth: {
        repository: 'jussray/founder-control-room',
        branch: 'main',
        baseSha: BAD_SHA,
        status: 'KNOWN_BAD',
        evidenceIds: ['check:failed-unit'],
        verifiedAt: '2026-09-25T09:00:00.000Z',
      },
      scope: {
        firstFilesOrLogs: ['src/goalfix/skillRuntime.ts'],
        maxInitialReads: 1,
        stopCondition: 'Stop after the queued implementation is verified.',
      },
    });

    expect(decision.mayProceed).toBe(false);
    expect(decision.baseGate.status).toBe('BLOCKED');
    expect(decision.nextAction).toContain('Repair or revert it first');
  });

  it('allows only the focused repair path while the base is known bad', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Repair the verified bad base before continuing.', confirmed: true },
      operation: 'repair-base',
      baseHealth: {
        repository: 'jussray/founder-control-room',
        branch: 'main',
        baseSha: BAD_SHA,
        status: 'KNOWN_BAD',
        evidenceIds: ['check:failed-unit'],
        verifiedAt: '2026-09-25T09:00:00.000Z',
      },
      scope: {
        firstFilesOrLogs: ['failing test', 'touched source'],
        maxInitialReads: 2,
        stopCondition: 'Stop once the bad base is repaired and the successor SHA is verified.',
      },
    });

    expect(decision.mayProceed).toBe(true);
    expect(decision.baseGate.status).toBe('REPAIR_ONLY');
    expect(decision.nextAction).toContain('verify the successor exact SHA');
  });

  it('unlocks queued build work only from an evidence-backed clean successor', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Continue the queued implementation from the repaired successor.', confirmed: true },
      operation: 'build',
      baseHealth: verifiedCleanBase(),
      scope: {
        firstFilesOrLogs: ['src/goalfix/skillRuntime.ts'],
        maxInitialReads: 1,
        stopCondition: 'Stop after the queued implementation is verified.',
      },
    });

    expect(decision.mayProceed).toBe(true);
    expect(decision.baseGate.status).toBe('PASS');
    expect(decision.baseGate.reason).toContain('VERIFIED_CLEAN successor');
  });

  it('rejects a clean label without actual evidence and verification time', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Continue the queued implementation.', confirmed: true },
      operation: 'build',
      baseHealth: {
        repository: 'jussray/founder-control-room',
        branch: 'main',
        baseSha: CLEAN_SHA,
        status: 'VERIFIED_CLEAN',
        evidenceIds: [],
      },
      scope: {
        firstFilesOrLogs: ['src/goalfix/skillRuntime.ts'],
        maxInitialReads: 1,
        stopCondition: 'Stop after the queued implementation is verified.',
      },
    });

    expect(decision.mayProceed).toBe(false);
    expect(decision.baseGate.status).toBe('BLOCKED');
    expect(decision.nextAction).toContain('not enough as a label');
  });
});
