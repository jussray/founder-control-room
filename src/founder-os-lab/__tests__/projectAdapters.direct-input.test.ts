import { describe, expect, it } from 'vitest';
import type { FounderOsLabProjectContext } from '../contracts.js';
import { planFounderOsLab } from '../engine.js';

const VALID_HEAD = 'aeacd00379dbe3b3c457d140ab5b89210f8afeda';

describe('Se’kret Bip direct planner input hardening', () => {
  it('returns a blocked plan instead of throwing for malformed casted project fields', () => {
    const malformedProject = {
      id: 'sekret-bip',
      sourceRepository: 42,
      sourceCommitSha: { branch: 'main' },
      contractUrls: null,
      audience: 'parent',
    } as unknown as FounderOsLabProjectContext;

    const plan = planFounderOsLab({
      goal: 'Inspect malformed project evidence.',
      action: 'inspect',
      provider: 'github',
      project: malformedProject,
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.route.project).toMatchObject({
      id: 'sekret-bip',
      repository: '',
      sourceCommitSha: '',
      audience: null,
      executionAllowed: false,
      contractPathsObserved: [],
    });
    const blocked = plan.truth.blocked.join(' ');
    expect(blocked).toContain('sourceRepository must be exactly jussray/Sekret-Bip');
    expect(blocked).toContain('sourceCommitSha must be an exact 40-character hexadecimal SHA');
    expect(blocked).toContain('contractUrls must contain 1 to 20 unique bounded HTTPS URL strings');
    expect(blocked).toContain('audience must be one of: teen, bip-jr');
    expect(plan.authority.executionAllowed).toBe(false);
  });

  it('rejects duplicate contract URL claims rather than counting them as complete evidence', () => {
    const duplicateUrl = `https://github.com/jussray/Sekret-Bip/blob/${VALID_HEAD}/docs/COMPANION_NAME_CANON.md`;
    const project = {
      id: 'sekret-bip',
      sourceRepository: 'jussray/Sekret-Bip',
      sourceCommitSha: VALID_HEAD,
      contractUrls: [duplicateUrl, duplicateUrl],
    } as FounderOsLabProjectContext;

    const plan = planFounderOsLab({
      goal: 'Inspect duplicate canon evidence.',
      action: 'inspect',
      provider: 'github',
      project,
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.truth.blocked.join(' ')).toContain(
      'contractUrls must contain 1 to 20 unique bounded HTTPS URL strings',
    );
    expect(plan.route.project?.contractPathsMissing.length).toBeGreaterThan(0);
  });

  it('fails closed for a project ID introduced through an unsafe cast', () => {
    const project = {
      id: 'unknown-project',
      sourceRepository: 'jussray/Sekret-Bip',
      sourceCommitSha: VALID_HEAD,
      contractUrls: ['https://github.com/jussray/Sekret-Bip'],
    } as unknown as FounderOsLabProjectContext;

    const plan = planFounderOsLab({
      goal: 'Inspect an unknown project adapter.',
      action: 'inspect',
      provider: 'github',
      project,
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.route.project).toBeNull();
    expect(plan.truth.blocked).toContain('Unknown Founder OS project adapter: unknown-project.');
    expect(plan.authority.executionAllowed).toBe(false);
  });
});
