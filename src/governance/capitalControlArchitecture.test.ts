import { describe, expect, it } from 'vitest';
import {
  CAPITAL_CONTROL_ARCHITECTURE,
  capitalRequiredClaims,
  evaluateCapitalAction,
  type CapitalEvidenceClaim,
} from './capitalControlArchitecture.js';

describe('capital control architecture', () => {
  it('keeps the legal structure honest until external documents prove it', () => {
    expect(CAPITAL_CONTROL_ARCHITECTURE.state).toBe('design_only');
    expect(CAPITAL_CONTROL_ARCHITECTURE.legalReality).toEqual({
      parentEntity: 'UNKNOWN',
      projectSubsidiaries: 'UNKNOWN',
      shareClasses: 'UNKNOWN',
      capTable: 'UNKNOWN',
      valuation: 'UNKNOWN',
      offering: 'NOT_AUTHORIZED',
    });
  });

  it('models separate portfolio and project investment lanes', () => {
    expect(CAPITAL_CONTROL_ARCHITECTURE.investmentLanes.map((lane) => lane.id)).toEqual([
      'portfolio',
      'project',
    ]);
  });

  it('denies securities issuance and public offering while architecture is design-only', () => {
    expect(evaluateCapitalAction({ action: 'issue-security' }).decision).toBe('deny');
    expect(evaluateCapitalAction({ action: 'publish-offering' }).decision).toBe('deny');
  });

  it('requires project ownership and parent/founder control proof for a project offering', () => {
    const projectClaims = capitalRequiredClaims('publish-offering', 'project');
    expect(projectClaims).toContain('project_ownership_boundary_verified');
    expect(projectClaims).toContain('parent_or_founder_control_verified');

    const portfolioClaims = capitalRequiredClaims('publish-offering', 'portfolio');
    expect(portfolioClaims).not.toContain('project_ownership_boundary_verified');
  });

  it('hard blocks surrendering founder control or turning investors into operators', () => {
    expect(evaluateCapitalAction({
      action: 'surrender-founder-control',
      architectureState: 'legally_verified',
    }).decision).toBe('deny');
    expect(evaluateCapitalAction({
      action: 'grant-investor-operational-authority',
      architectureState: 'legally_verified',
    }).decision).toBe('deny');
  });

  it('fails closed on a project offering until every registered proof is present', () => {
    const required = capitalRequiredClaims('publish-offering', 'project');
    const incomplete = required.filter((claim) => claim !== 'post_change_control_verified');

    const verdict = evaluateCapitalAction({
      action: 'publish-offering',
      lane: 'project',
      architectureState: 'legally_verified',
      verifiedClaims: incomplete,
    });

    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.missingClaims).toEqual(['post_change_control_verified']);
  });

  it('permits the modeled project offering path only after legal verification and complete evidence', () => {
    const verifiedClaims = capitalRequiredClaims('publish-offering', 'project') as CapitalEvidenceClaim[];
    const verdict = evaluateCapitalAction({
      action: 'publish-offering',
      lane: 'project',
      architectureState: 'legally_verified',
      verifiedClaims,
    });

    expect(verdict).toEqual({
      decision: 'allow',
      missingClaims: [],
      reasons: ['all registered capital-control evidence requirements are satisfied'],
    });
  });
});
