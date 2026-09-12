import { describe, expect, it } from 'vitest';
import { PROJECT_SHELLS } from '../../config/projectShells.js';
import { buildProjectShellModel, CANONICAL_SHELL_CONTAINERS } from '../projectShellModel.js';

describe('project shell canonical-container binding', () => {
  it('binds Se’kret Bip to the shared containers while preserving its project-specific shell', () => {
    const model = buildProjectShellModel('sekret-bip', {
      project: { slug: 'sekret-bip', name: "Se’kret Bip", status: 'active' },
      evidence: [{ kind: 'playwright', status: 'passed' }],
      outcome: { classification: 'achieved' },
      truth: { classification: 'verified' },
    });

    expect(model.definition.shellName).toBe('Se’kret Bip Project Shell');
    expect(model.visibleContainers).toEqual(CANONICAL_SHELL_CONTAINERS);
    expect(model.projectSpecificViews).toContain('safety');
    expect(model.projectSpecificViews).toContain('mobile-runtime');
    expect(model.truthMode.label).toBe('TRUTHMODE / CONFESS');
    expect(model.truthMode.mayClaimVerifiedOutcome).toBe(true);
  });

  it('confesses UNKNOWN when truth is absent instead of manufacturing verification', () => {
    const model = buildProjectShellModel('sekret-bip', {
      project: { slug: 'sekret-bip' },
      outcome: { classification: 'achieved' },
    });
    expect(model.truthMode.classification).toBe('unknown');
    expect(model.truthMode.mayClaimVerifiedOutcome).toBe(false);
  });

  it('does not allow a verified claim without both outcome and evidence', () => {
    const model = buildProjectShellModel('sekret-bip', {
      project: { slug: 'sekret-bip' },
      truth: { classification: 'verified' },
    });
    expect(model.truthMode.mayClaimVerifiedOutcome).toBe(false);
  });

  it('preserves simultaneous realities by plane instead of collapsing them', () => {
    const model = buildProjectShellModel('founder-control-room', {
      project: { slug: 'founder-control-room' },
      evidence: [{ kind: 'github' }, { kind: 'runtime' }],
      outcome: { classification: 'observed' },
      truth: {
        classification: 'verified',
        relation: 'coherent',
        governingRealityId: 'runtime',
        realities: [
          {
            id: 'source',
            subject: 'release',
            plane: 'state',
            classification: 'verified',
            scope: 'main',
            observer: 'github',
          },
          {
            id: 'runtime',
            subject: 'release',
            plane: 'runtime',
            classification: 'verified',
            scope: 'production',
            observer: 'deployment',
          },
        ],
      },
    });

    expect(model.truthMode.realities).toHaveLength(2);
    expect(model.truthMode.relation).toBe('coherent');
    expect(model.truthMode.governingRealityId).toBe('runtime');
    expect(model.truthMode.hasUnresolvedContradiction).toBe(false);
    expect(model.truthMode.mayClaimVerifiedOutcome).toBe(true);
  });

  it('blocks a verified outcome claim when same-decision realities remain contradictory', () => {
    const model = buildProjectShellModel('founder-control-room', {
      project: { slug: 'founder-control-room' },
      evidence: [{ kind: 'github' }, { kind: 'runtime' }],
      outcome: { classification: 'achieved' },
      truth: {
        classification: 'verified',
        relation: 'contradiction',
        realities: [
          { id: 'source', subject: 'release', plane: 'state', classification: 'verified' },
          { id: 'runtime', subject: 'release', plane: 'runtime', classification: 'conflicted' },
        ],
      },
    });

    expect(model.truthMode.hasUnresolvedContradiction).toBe(true);
    expect(model.truthMode.mayClaimVerifiedOutcome).toBe(false);
  });

  it('binds the multi-reality truth contract into every project control room', () => {
    for (const shell of PROJECT_SHELLS) {
      expect(shell.inheritedFcrContracts).toContain('multi-reality-truth');
    }
  });

  it('rejects cross-project state injection', () => {
    expect(() => buildProjectShellModel('sekret-bip', {
      project: { slug: 'chief-ai-machine' },
    })).toThrow('project_shell_state_mismatch:sekret-bip');
  });
});
