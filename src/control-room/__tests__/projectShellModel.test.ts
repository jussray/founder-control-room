import { describe, expect, it } from 'vitest';
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

  it('rejects cross-project state injection', () => {
    expect(() => buildProjectShellModel('sekret-bip', {
      project: { slug: 'chief-ai-machine' },
    })).toThrow('project_shell_state_mismatch:sekret-bip');
  });
});
