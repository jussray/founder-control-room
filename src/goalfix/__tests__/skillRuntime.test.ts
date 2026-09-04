import { describe, expect, it } from 'vitest';
import { buildGoalfixSkillRuntimeDecision } from '../skillRuntime.js';

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
    expect(decision.artOfWar).toBeNull();
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

  it('routes movement through the Art of War assessment when exact strategy context is supplied', () => {
    const currentMain = 'a'.repeat(40);
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Use the smallest verified route to repair the current blocker.', confirmed: true },
      scope: {
        firstFilesOrLogs: ['src/goalfix/skillRuntime.ts'],
        maxInitialReads: 1,
        stopCondition: 'Stop after the focused strategy contract is proven.',
      },
      strategy: {
        repository: 'jussray/founder-control-room',
        targetBranch: 'main',
        baseSha: currentMain,
        currentMainSha: currentMain,
        goal: 'Choose one reversible evidence-backed move.',
        groundFacts: ['Exact main is known'],
        unknowns: [],
        verifiedAsymmetries: ['Focused tests already exist'],
        options: [
          {
            id: 'focused',
            label: 'Patch the focused cause',
            expectedValue: 5,
            evidenceStrength: 5,
            reversibility: 5,
            siegeCost: 1,
            uncertainty: 1,
            dependencyCost: 1,
            preservesFutureOptions: true,
            evidenceIds: ['test:goalfix'],
          },
        ],
        proofOfAdvantage: ['test:goalfix'],
        observedAt: '2026-09-03T22:55:00.000Z',
      },
    });

    expect(decision.mayProceed).toBe(true);
    expect(decision.artOfWar?.maneuver).toBe('EXPLOIT_VERIFIED_ASYMMETRY');
    expect(decision.artOfWar?.continuityCookie.authorizing).toBe(false);
    expect(decision.nextAction).toContain('Use verified advantage');
  });

  it('lets stale-ground strategy veto movement before mutation', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: { raw: 'Continue the repair.', confirmed: true },
      scope: {
        firstFilesOrLogs: ['src/goalfix/skillRuntime.ts'],
        maxInitialReads: 1,
        stopCondition: 'Stop if main moved.',
      },
      strategy: {
        repository: 'jussray/founder-control-room',
        targetBranch: 'main',
        baseSha: 'a'.repeat(40),
        currentMainSha: 'b'.repeat(40),
        goal: 'Continue only if the ground is current.',
        groundFacts: ['Candidate was prepared against the prior main'],
        unknowns: [],
        verifiedAsymmetries: [],
        options: [],
        proofOfAdvantage: [],
        observedAt: '2026-09-03T23:00:00.000Z',
      },
    });

    expect(decision.mayProceed).toBe(false);
    expect(decision.artOfWar?.maneuver).toBe('REACQUIRE_GROUND');
    expect(decision.nextAction).toContain('Reacquire current main');
  });
});
