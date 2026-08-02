import { describe, expect, it } from 'vitest';
import { buildGoalfixReport, type BuildGoalfixReportInput } from '../engine.js';

const SHA = 'abc123abc123abc123abc123abc123abc123abcd';

function baseInput(overrides: Partial<BuildGoalfixReportInput> = {}): BuildGoalfixReportInput {
  const base: BuildGoalfixReportInput = {
    project: {
      id: 'project-1',
      slug: 'sekret-bip',
      name: "Se'kret Bip",
      repository: 'jussray/Sekret-Bip',
      provider: 'github',
    },
    target: { name: 'main', commitSha: SHA },
    goal: {
      desiredOutcome: 'Keep the public welcome available before login.',
      constraints: ['Preserve protected route guards.'],
      firstFilesOrLogs: ['app/_layout.tsx'],
      expectedVerificationNames: ['Typecheck', 'Playwright'],
    },
    verificationSignals: [],
    observedAt: new Date('2026-07-27T20:00:00.000Z'),
  };
  return {
    ...base,
    ...overrides,
    goal: overrides.goal ?? base.goal,
  };
}

describe('buildGoalfixReport', () => {
  it('requires more evidence when the exact head has no signals', () => {
    const report = buildGoalfixReport(baseInput());

    expect(report.readiness).toBe('waiting_for_evidence');
    expect(report.authority).toEqual({
      level: 'L1',
      mode: 'read-only',
      mutationAllowed: false,
      requiresExplicitApprovalForMutation: true,
    });
    expect(report.evidence.unknown).toContain('Missing required exact-head verification signal: Typecheck.');
    expect(report.evidence.unknown).toContain('Missing required exact-head verification signal: Playwright.');
    expect(report.evidence.unknown).toContain(`No exact-head verification signals were returned for ${SHA}.`);
    expect(report.fix).toEqual(['No fix was applied. Goalfix v1 stops at inspection and founder decision authority.']);
  });

  it('blocks on any exact-head failed signal', () => {
    const report = buildGoalfixReport(baseInput({
      verificationSignals: [{
        id: 'check-1',
        name: 'Product Design Playwright Proof',
        status: 'failed',
        commitSha: SHA,
        provider: 'github',
      }],
    }));

    expect(report.readiness).toBe('blocked');
    expect(report.evidence.blocked).toEqual([
      `Product Design Playwright Proof: failed at ${SHA}`,
    ]);
    expect(report.nextGate).toContain('repair only its verified root cause');
  });

  it('uses the latest same-SHA signal when a check rerun replaces an older failure', () => {
    const report = buildGoalfixReport(baseInput({
      verificationSignals: [
        {
          id: 'playwright-old',
          name: 'Playwright',
          status: 'failed',
          commitSha: SHA,
          provider: 'github',
          startedAt: '2026-08-02T00:00:00.000Z',
          completedAt: '2026-08-02T00:01:00.000Z',
        },
        {
          id: 'playwright-new',
          name: 'Playwright',
          status: 'passed',
          commitSha: SHA,
          provider: 'github',
          startedAt: '2026-08-02T00:02:00.000Z',
          completedAt: '2026-08-02T00:03:00.000Z',
        },
        {
          id: 'typecheck',
          name: 'Typecheck',
          status: 'passed',
          commitSha: SHA,
          provider: 'github',
        },
      ],
    }));

    expect(report.readiness).toBe('ready_for_founder_decision');
    expect(report.evidence.blocked).toEqual([]);
    expect(report.proof).toContain(`Playwright: passed at ${SHA}`);
    expect(report.proof).not.toContain(`Playwright: failed at ${SHA}`);
  });

  it('does not declare readiness when one named required check is absent', () => {
    const report = buildGoalfixReport(baseInput({
      verificationSignals: [
        { id: 'check-1', name: 'Typecheck', status: 'passed', commitSha: SHA, provider: 'github' },
      ],
    }));

    expect(report.readiness).toBe('waiting_for_evidence');
    expect(report.evidence.unknown).toContain('Missing required exact-head verification signal: Playwright.');
    expect(report.nextGate).toContain('every named required exact-head verification');
  });

  it('becomes decision-ready only when every named exact-head signal passed', () => {
    const report = buildGoalfixReport(baseInput({
      verificationSignals: [
        { id: 'check-1', name: 'Typecheck', status: 'passed', commitSha: SHA, provider: 'github' },
        { id: 'check-2', name: 'Playwright', status: 'passed', commitSha: SHA, provider: 'github' },
      ],
    }));

    expect(report.readiness).toBe('ready_for_founder_decision');
    expect(report.proof).toHaveLength(3);
    expect(report.proof[0]).toBe('Required exact-head checks: Typecheck, Playwright.');
    expect(report.nextGate).toContain('complete named proof set');
    expect(report.reality).toContain(
      'This inspection performed no repository, provider, deployment, product-data, CRM, or publication mutation. The route may retain one sanitized internal access-audit event.',
    );
    expect(report.rollback[0]).toContain('retain any sanitized audit event as historical evidence');
  });

  it('refuses readiness when no required check names are supplied', () => {
    const report = buildGoalfixReport(baseInput({
      goal: {
        desiredOutcome: 'Inspect the repository.',
        constraints: [],
        firstFilesOrLogs: [],
        expectedVerificationNames: [],
      },
      verificationSignals: [
        { id: 'check-1', name: 'Typecheck', status: 'passed', commitSha: SHA, provider: 'github' },
      ],
    }));

    expect(report.readiness).toBe('waiting_for_evidence');
    expect(report.evidence.unknown).toContain(
      'No required verification signal names were supplied; decision readiness cannot be established.',
    );
  });

  it('ignores proof from a different commit instead of creating a false green', () => {
    const report = buildGoalfixReport(baseInput({
      verificationSignals: [{
        id: 'check-stale',
        name: 'Typecheck',
        status: 'passed',
        commitSha: 'def456def456def456def456def456def456def4',
        provider: 'github',
      }],
    }));

    expect(report.readiness).toBe('waiting_for_evidence');
    expect(report.evidence.verified).not.toContain('Stale green check');
    expect(report.evidence.unknown).toContain(
      '1 verification signal(s) were ignored because their commit SHA did not match the inspected head.',
    );
  });
});