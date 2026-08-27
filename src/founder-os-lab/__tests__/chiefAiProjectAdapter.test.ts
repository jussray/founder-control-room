import { describe, expect, it } from 'vitest';
import { planFounderOsLab } from '../engine.js';
import { FOUNDER_OS_LAB_PROJECT_ADAPTERS } from '../projectAdapters.js';

const foundAdapter = FOUNDER_OS_LAB_PROJECT_ADAPTERS.find(
  (candidate) => candidate.id === 'chief-ai-machine',
);
if (!foundAdapter) throw new Error('chief-ai-machine adapter missing');
const ADAPTER = foundAdapter;

function contractUrls(paths: readonly string[] = ADAPTER.requiredContractPaths) {
  return paths.map(
    (path) => `https://github.com/jussray/chief-ai-machine/blob/${ADAPTER.auditedSourceHead}/${path}`,
  );
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chief-ai-machine' as const,
    sourceRepository: ADAPTER.repository,
    sourceCommitSha: ADAPTER.auditedSourceHead,
    contractUrls: contractUrls(),
    ...overrides,
  };
}

describe('Chief AI Founder OS project adapter', () => {
  it('pins the live Chief contract spine without copying execution authority', () => {
    expect(ADAPTER).toMatchObject({
      id: 'chief-ai-machine',
      adapterId: 'chief-ai-machine-project-preview',
      repository: 'jussray/chief-ai-machine',
      auditedSourceHead: '2fd4fda0cab12e52ab5096e723884d98bcfe7d10',
      authorityOwner: 'founder-control-room',
      mode: 'preview',
      executionAllowed: false,
      allowedActions: ['inspect', 'plan'],
      allowedAudiences: [],
      sourceTraceRequired: true,
    });
    expect(ADAPTER.requiredContractPaths).toEqual([
      'src/domain/capability-plan.js',
      'src/domain/capability-registry.js',
      'src/domain/merge-intent.js',
      'config/founder-chief-pair.contract.json',
      'e2e/chief-capability-plan.pw.mjs',
    ]);
  });

  it('produces an exact-head read-only Chief inspection using generic project truth', () => {
    const plan = planFounderOsLab({
      goal: 'Inspect Chief AI authority and capability contracts.',
      action: 'inspect',
      command: 'truthmode',
      provider: 'github',
      project: project(),
    });

    expect(plan.readiness).toBe('ready_for_review');
    expect(plan.route.project).toMatchObject({
      id: 'chief-ai-machine',
      repository: 'jussray/chief-ai-machine',
      sourceCommitSha: ADAPTER.auditedSourceHead,
      auditedSourceHead: ADAPTER.auditedSourceHead,
      audience: null,
      executionAllowed: false,
      contractPathsObserved: ADAPTER.requiredContractPaths,
      contractPathsMissing: [],
    });
    expect(plan.route.capabilities).toEqual(expect.arrayContaining([
      'project-contract-validation',
      'capability-plan-validation',
      'authority-boundary-validation',
    ]));
    expect(plan.route.adapters).toContain('chief-ai-machine-project-preview');
    expect(plan.truth.verified.join(' ')).toContain('Founder Control Room owns governance');
    expect(plan.truth.verified.join(' ')).not.toContain('Se’kret Bip display canon');
    expect(plan.authority.executionAllowed).toBe(false);
  });

  it('fails closed for audience leakage, source drift, and missing contract evidence', () => {
    const audienceLeak = planFounderOsLab({
      goal: 'Inspect Chief AI with unrelated presentation context.',
      action: 'inspect',
      provider: 'github',
      project: project({ audience: 'teen' }),
    });
    expect(audienceLeak.readiness).toBe('blocked');
    expect(audienceLeak.truth.blocked.join(' ')).toContain(
      'chief-ai-machine does not accept an audience context',
    );

    const staleHead = planFounderOsLab({
      goal: 'Inspect unaudited Chief code.',
      action: 'inspect',
      provider: 'github',
      project: project({ sourceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
    });
    expect(staleHead.readiness).toBe('blocked');
    expect(staleHead.truth.blocked.join(' ')).toContain('has not been audited');

    const missingContract = planFounderOsLab({
      goal: 'Inspect incomplete Chief authority evidence.',
      action: 'inspect',
      provider: 'github',
      project: project({ contractUrls: contractUrls(ADAPTER.requiredContractPaths.slice(0, -1)) }),
    });
    expect(missingContract.readiness).toBe('blocked');
    expect(missingContract.route.project?.contractPathsMissing).toEqual([
      'e2e/chief-capability-plan.pw.mjs',
    ]);
  });

  it('keeps Chief project routing non-executing even with an approval-shaped input', () => {
    const plan = planFounderOsLab({
      goal: 'Deploy Chief AI from the project adapter.',
      action: 'deploy-code',
      command: 'goalfix',
      provider: 'cloudflare',
      approval: {
        id: 'founder-approved:chief-project-adapter-test',
        actions: ['deploy-code'],
      },
      project: project(),
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.truth.blocked.join(' ')).toContain(
      'chief-ai-machine adapter supports only inspect and plan previews in V1',
    );
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.isolation.providerCalls).toBe(false);
  });
});
