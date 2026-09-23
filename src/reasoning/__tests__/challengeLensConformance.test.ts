import { describe, expect, it } from 'vitest';
import {
  FCR_CHALLENGE_LENS_CONFORMANCE,
  PROMPTOS_CHALLENGE_LENS_CONTRACT,
  validateCloudflareChallengeLensSpecialization,
} from '../challengeLensConformance.js';
import { reasonAboutCloudflare } from '../cloudflare/reason.js';
import type { CloudflareSignal } from '../cloudflare/types.js';

const NOW = '2026-09-20T19:30:00.000Z';
const SHA = 'a'.repeat(40);

function signal(
  partial: Partial<CloudflareSignal> & Pick<CloudflareSignal, 'id' | 'kind' | 'status'>,
): CloudflareSignal {
  return {
    source: 'conformance-test',
    observedAt: '2026-09-20T19:25:00.000Z',
    ...partial,
  };
}

function verifiedSignals(): CloudflareSignal[] {
  return [
    signal({ id: 'worker', kind: 'worker_deployment', status: 'success', commitSha: SHA, authority: 'native_git' }),
    signal({ id: 'pages', kind: 'pages_deployment', status: 'success', commitSha: SHA, authority: 'native_git' }),
    signal({ id: 'health', kind: 'runtime_health', status: 'success' }),
    signal({ id: 'route', kind: 'route', status: 'success' }),
  ];
}

describe('PromptOS challenge-lens conformance', () => {
  it('pins FCR to the canonical PromptOS Bill Gates and Elon Musk semantics without granting authority', () => {
    expect(PROMPTOS_CHALLENGE_LENS_CONTRACT).toBe('promptos/ai-mastery-v6@6.0.0');
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.contract).toBe(PROMPTOS_CHALLENGE_LENS_CONTRACT);
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.authorityEffect).toBe('none');
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.billgates.objective).toBe('durable_growth');
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.billgates.role).toBe('durable-leverage');
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.billgates.behaviors).toContain('do-not-scale-an-unproven-path');
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.elonmusk.objective).toBe('upside_growth');
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.elonmusk.role).toBe('first-principles-execution');
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.elonmusk.behaviors).toContain('delete-before-optimizing');
    expect(FCR_CHALLENGE_LENS_CONFORMANCE.elonmusk.behaviors).toContain('accelerate-feedback-and-automate-last');
  });

  it('accepts the existing Cloudflare reasoner as a domain specialization of the canonical lenses', () => {
    const report = reasonAboutCloudflare({
      projectId: 'founder-control-room',
      desired: { commitSha: SHA, deploymentAuthority: 'native_git' },
      signals: verifiedSignals(),
      now: NOW,
    });

    expect(validateCloudflareChallengeLensSpecialization(report)).toEqual([]);
    expect(report.billGates.bottleneck).toMatch(/bottleneck/i);
    expect(report.billGates.leveragePoint).toMatch(/evidence|authority/i);
    expect(report.elonMusk.questionRequirements).toMatch(/requirement/i);
    expect(report.elonMusk.deleteBeforeOptimize).toMatch(/^Delete\b/i);
    expect(report.elonMusk.automateLast).toMatch(/Automate only/i);
    expect(report.approvalCarryForward).toBe(false);
  });

  it('fails closed when a specialized report drops the durable or first-principles boundaries', () => {
    const report = reasonAboutCloudflare({
      projectId: 'founder-control-room',
      desired: { commitSha: SHA, deploymentAuthority: 'native_git' },
      signals: verifiedSignals(),
      now: NOW,
    });

    const drifted = {
      ...report,
      billGates: { ...report.billGates, doNotScaleYet: 'Scale now.' },
      elonMusk: { ...report.elonMusk, automateLast: 'Automate immediately.' },
    };

    expect(validateCloudflareChallengeLensSpecialization(drifted)).toEqual(expect.arrayContaining([
      'billgates do-not-scale boundary missing',
      'elonmusk automate-last boundary missing',
    ]));
  });
});
