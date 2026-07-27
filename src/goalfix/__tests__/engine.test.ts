import { describe, expect, it } from 'vitest';
import { buildGoalfixReport, type BuildGoalfixReportInput } from '../engine.js';

const SHA = 'abc123abc123abc123abc123abc123abc123abcd';

function baseInput(overrides: Partial<BuildGoalfixReportInput> = {}): BuildGoalfixReportInput {
  return {
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
    },
    verificationSignals: [],
    observedAt: new Date('2026-07-27T20:00:00.000Z'),
    ...overrides,
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
    expect(report.evidence.unknown).toContain(`No exact-head verification signals were returned for ${SHA}.`);
    expect(report.fix).toEqual(['No fix was applied. Goalfix v1 stops at inspection and founder decision authority.']);
  });

  it('blocks on an exact-head failed signal', () => {
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

  it('becomes decision-ready only when every exact-head signal passed', () => {
    const report = buildGoalfixReport(baseInput({
      verificationSignals: [
        { id: 'check-1', name: 'Typecheck', status: 'passed', commitSha: SHA, provider: 'github' },
        { id: 'check-2', name: 'Playwright', status: 'passed', commitSha: SHA, provider: 'github' },
      ],
    }));

    expect(report.readiness).toBe('ready_for_founder_decision');
    expect(report.proof).toHaveLength(2);
    expect(report.nextGate).toContain('explicitly approves one bounded mutation');
    expect(report.reality).toContain(
      'This inspection performed no repository, provider, deployment, database, CRM, or publication mutation.',
    );
  });

  it('ignores proof from a different commit instead of creating a false green', () => {
    const report = buildGoalfixReport(baseInput({
      verificationSignals: [{
        id: 'check-stale',
        name: 'Stale green check',
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
