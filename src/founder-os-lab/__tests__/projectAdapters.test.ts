import { describe, expect, it } from 'vitest';
import { planFounderOsLab } from '../engine.js';
import { FOUNDER_OS_LAB_PROJECT_ADAPTERS } from '../projectAdapters.js';

const ADAPTER = FOUNDER_OS_LAB_PROJECT_ADAPTERS[0];

function contractUrls(paths: readonly string[] = ADAPTER.requiredContractPaths) {
  return paths.map(
    (path) => `https://github.com/jussray/Sekret-Bip/blob/${ADAPTER.auditedSourceHead}/${path}`,
  );
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sekret-bip' as const,
    sourceRepository: ADAPTER.repository,
    sourceCommitSha: ADAPTER.auditedSourceHead,
    contractUrls: contractUrls(),
    ...overrides,
  };
}

describe('Se’kret Bip Founder OS project adapter', () => {
  it('binds one portfolio identity to the audited repository and exact source head', () => {
    expect(FOUNDER_OS_LAB_PROJECT_ADAPTERS).toHaveLength(1);
    expect(ADAPTER).toMatchObject({
      id: 'sekret-bip',
      name: 'Se’kret Bip',
      repository: 'jussray/Sekret-Bip',
      auditedSourceHead: '8c7ae915bc5a85739c23022316b8e5c19da640d0',
      authorityOwner: 'founder-control-room',
      mode: 'preview',
      executionAllowed: false,
      allowedActions: ['inspect', 'plan'],
      legacyInternalIdsPreserved: true,
      editableOutputRequired: true,
      sourceTraceRequired: true,
      factualAiIdentityRequired: true,
    });
    expect(ADAPTER.canonicalDisplayNames).toEqual(['Night', 'Suhana', 'Sy', 'Cloud']);
    expect(ADAPTER.forbiddenDisplayNames).toEqual(['Suhanna']);
    expect(ADAPTER.requiredContractPaths).toEqual([
      'app/index.tsx',
      'screens/WebWelcomeScreen.tsx',
      'constants/frontDoorTheme.ts',
      'docs/COMPANION_NAME_CANON.md',
      'docs/FRONT_DOOR_VARIANTS.md',
      'implementation-ledger.extensions/human-ai-identity-contract.json',
      'test/dual-front-door-contract.test.mjs',
    ]);
    expect(ADAPTER.auditedContractBlobs).toMatchObject({
      'app/index.tsx': '46e73c816a392f289c377d5610243d8ef8189f7c',
      'screens/WebWelcomeScreen.tsx': '2520c10810593ebcab93e2d3be2a14cff6bd32ce',
      'test/dual-front-door-contract.test.mjs': '6f4a3743a6accf9064877d3759ecb006f35a1b98',
    });
  });

  it('produces a source-bound read-only repository inspection preview', () => {
    const plan = planFounderOsLab({
      goal: 'Inspect Se’kret Bip canon before proposing a change.',
      action: 'inspect',
      command: 'truthmode',
      provider: 'github',
      project: project(),
    });

    expect(plan.readiness).toBe('ready_for_review');
    expect(plan.route.project).toMatchObject({
      id: 'sekret-bip',
      repository: 'jussray/Sekret-Bip',
      sourceCommitSha: ADAPTER.auditedSourceHead,
      auditedSourceHead: ADAPTER.auditedSourceHead,
      audience: null,
      supported: true,
      executionAllowed: false,
      contractPathsObserved: ADAPTER.requiredContractPaths,
      contractPathsMissing: [],
      legacyInternalIdsPreserved: true,
      factualAiIdentityRequired: true,
    });
    expect(plan.route.capabilities).toEqual(expect.arrayContaining([
      'project-canon-validation',
      'editable-design-preview',
    ]));
    expect(plan.route.adapters).toContain('sekret-bip-project-preview');
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.isolation.providerCalls).toBe(false);
    expect(plan.nextGate).toContain('authoritative project repository');
  });

  it('requires explicit audience and editable source-traced rules for Figma previews', () => {
    const plan = planFounderOsLab({
      goal: 'Visualize the teen front door as editable layers.',
      action: 'plan',
      command: 'visualize',
      provider: 'figma',
      project: project({ audience: 'teen' }),
    });

    expect(plan.readiness).toBe('ready_for_review');
    expect(plan.route.project).toMatchObject({
      audience: 'teen',
      editableOutputRequired: true,
      sourceTraceRequired: true,
      canonicalDisplayNames: ['Night', 'Suhana', 'Sy', 'Cloud'],
      forbiddenDisplayNames: ['Suhanna'],
      executionAllowed: false,
    });
    expect(plan.truth.verified.join(' ')).toContain('audience separation');
    expect(plan.authority.executionAllowed).toBe(false);
  });

  it('blocks Figma previews without an audience or approved design lens', () => {
    const missingAudience = planFounderOsLab({
      goal: 'Visualize the front door.',
      action: 'plan',
      command: 'visualize',
      provider: 'figma',
      project: project(),
    });
    expect(missingAudience.readiness).toBe('blocked');
    expect(missingAudience.truth.blocked.join(' ')).toContain(
      'require an explicit teen or bip-jr presentation audience',
    );

    const wrongLens = planFounderOsLab({
      goal: 'Visualize the front door.',
      action: 'plan',
      command: 'truthmode',
      provider: 'figma',
      project: project({ audience: 'bip-jr' }),
    });
    expect(wrongLens.readiness).toBe('blocked');
    expect(wrongLens.truth.blocked.join(' ')).toContain(
      'require the visualize or build command lens',
    );
  });

  it('fails closed for repository, source-head, and canon-contract drift', () => {
    const wrongRepository = planFounderOsLab({
      goal: 'Inspect a project copy.',
      action: 'inspect',
      provider: 'github',
      project: project({ sourceRepository: 'another-owner/Sekret-Bip' }),
    });
    expect(wrongRepository.readiness).toBe('blocked');
    expect(wrongRepository.truth.blocked.join(' ')).toContain(
      'sourceRepository must be exactly jussray/Sekret-Bip',
    );

    const staleHead = planFounderOsLab({
      goal: 'Inspect an unaudited head.',
      action: 'inspect',
      provider: 'github',
      project: project({ sourceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
    });
    expect(staleHead.readiness).toBe('blocked');
    expect(staleHead.truth.blocked.join(' ')).toContain('has not been audited');

    const missingContract = planFounderOsLab({
      goal: 'Inspect incomplete canon evidence.',
      action: 'inspect',
      provider: 'github',
      project: project({
        contractUrls: contractUrls(ADAPTER.requiredContractPaths.slice(0, -1)),
      }),
    });
    expect(missingContract.readiness).toBe('blocked');
    expect(missingContract.route.project?.contractPathsMissing).toEqual([
      'test/dual-front-door-contract.test.mjs',
    ]);
    expect(missingContract.truth.blocked.join(' ')).toContain(
      'is missing exact-head canon contract URLs',
    );
  });

  it('rejects lookalike, wrong-ref, and noncanonical contract URLs', () => {
    const badUrls = [
      `https://example.com/jussray/Sekret-Bip/blob/${ADAPTER.auditedSourceHead}/docs/COMPANION_NAME_CANON.md`,
      `https://github.com/jussray/Sekret-Bip/blob/main/docs/COMPANION_NAME_CANON.md`,
      `https://github.com/jussray//Sekret-Bip/blob/${ADAPTER.auditedSourceHead}/docs/COMPANION_NAME_CANON.md`,
    ];

    for (const badUrl of badUrls) {
      const urls = contractUrls().filter((url) => !url.endsWith('/docs/COMPANION_NAME_CANON.md'));
      urls.push(badUrl);
      const plan = planFounderOsLab({
        goal: 'Inspect project canon.',
        action: 'inspect',
        provider: 'github',
        project: project({ contractUrls: urls }),
      });
      expect(plan.readiness).toBe('blocked');
      expect(plan.route.project?.contractPathsMissing).toContain('docs/COMPANION_NAME_CANON.md');
    }
  });

  it('refuses mutating actions and unrelated providers in V1', () => {
    const deploy = planFounderOsLab({
      goal: 'Deploy Se’kret Bip from Founder Control Room.',
      action: 'deploy-code',
      command: 'goalfix',
      provider: 'cloudflare',
      approval: {
        id: 'founder-approved:project-adapter-test',
        actions: ['deploy-code'],
      },
      project: project({ audience: 'teen' }),
    });
    expect(deploy.readiness).toBe('blocked');
    expect(deploy.truth.blocked.join(' ')).toContain(
      'adapter supports only inspect and plan previews in V1',
    );
    expect(deploy.authority.executionAllowed).toBe(false);

    const crm = planFounderOsLab({
      goal: 'Route Se’kret Bip canon into CRM.',
      action: 'plan',
      command: 'truthmode',
      provider: 'hubspot',
      project: project(),
    });
    expect(crm.readiness).toBe('blocked');
    expect(crm.truth.blocked.join(' ')).toContain(
      'hubspot is not an allowed sekret-bip preview provider',
    );
    expect(crm.authority.executionAllowed).toBe(false);
  });
});
