import { describe, expect, it } from 'vitest';
import { GOALFIX_AUTO_STOP_CONDITION } from '../contextResolution.js';
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

  it('blocks an automatic semantic rewrite even when the route supplied confirmed=true', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: {
        raw: 'Keep the public welcome available before login.',
        resolved: 'Replace the public welcome with a private dashboard.',
        confirmed: true,
      },
      scope: {
        firstFilesOrLogs: ['control-room.manifest.json'],
        maxInitialReads: 1,
        stopCondition: GOALFIX_AUTO_STOP_CONDITION,
      },
    });

    expect(decision.intent.confirmed).toBe(false);
    expect(decision.intent.confidence).toBe('low');
    expect(decision.mayProceed).toBe(false);
    expect(decision.nextAction).toContain('Resolve the founder intent');
  });

  it('permits an explicit manual assumption-backed resolution outside the automatic lane', () => {
    const decision = buildGoalfixSkillRuntimeDecision({
      intent: {
        raw: 'cont the skill thing',
        resolved: 'Continue the focused Goalfix skill-runtime implementation.',
        assumptions: ['The referenced skill is the uploaded Lean Build Suite.'],
      },
      scope: {
        firstFilesOrLogs: ['src/goalfix/engine.ts'],
        maxInitialReads: 1,
        stopCondition: 'Stop after the focused runtime contract is verified.',
      },
    });

    expect(decision.intent.confirmed).toBe(true);
    expect(decision.intent.confidence).toBe('medium');
    expect(decision.mayProceed).toBe(true);
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
});
