import { describe, expect, it } from 'vitest';
import { PORTFOLIO_PROJECTS } from '../config/portfolio.js';
import {
  DEFAULT_LANTERN_POLICY,
  STRATEGIC_SECURITY_STAGES,
  auditPortfolioStrategicSecurity,
  strategicSecurityDecision,
  strategicSecurityTargetForProject,
  validateLanternPolicy,
  validateStrategicSecurityExecution,
} from './strategicSecurity.js';

describe('strategic security v10', () => {
  it('defines one ordered, cumulative V1 through V10 security ladder', () => {
    expect(STRATEGIC_SECURITY_STAGES).toHaveLength(10);
    expect(STRATEGIC_SECURITY_STAGES.map((stage) => stage.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(STRATEGIC_SECURITY_STAGES[0]?.controls).toContain('asset-inventory');
    expect(STRATEGIC_SECURITY_STAGES[6]?.controls).toContain('artifact-attestation');
    expect(STRATEGIC_SECURITY_STAGES[7]?.controls).toContain('lantern-decoy');
    expect(STRATEGIC_SECURITY_STAGES[9]?.controls).toContain('approval-binding');
  });

  it('audits every active portfolio project without importing quarantined repositories', () => {
    const active = PORTFOLIO_PROJECTS.filter((project) => project.status === 'active');
    const audits = auditPortfolioStrategicSecurity();

    expect(audits).toHaveLength(active.length);
    expect(audits.map((audit) => audit.repository).sort()).toEqual(active.map((project) => project.repository).sort());
    expect(audits.every((audit) => audit.requiredStages.length === audit.targetVersion)).toBe(true);
  });

  it('raises privileged, provider-routing, and sensitive companion projects to V10', () => {
    const bySlug = new Map(PORTFOLIO_PROJECTS.map((project) => [project.slug, project]));

    expect(strategicSecurityTargetForProject(bySlug.get('founder-control-room')!).targetVersion).toBe(10);
    expect(strategicSecurityTargetForProject(bySlug.get('chief-ai-machine')!).targetVersion).toBe(10);
    expect(strategicSecurityTargetForProject(bySlug.get('sekret-bip')!).targetVersion).toBe(10);
  });

  it('keeps Lantern defensive, isolated, auditable, and attribution-constrained', () => {
    expect(validateLanternPolicy({ ...DEFAULT_LANTERN_POLICY })).toEqual([]);

    expect(validateLanternPolicy({
      ...DEFAULT_LANTERN_POLICY,
      isolated: false,
      realDataAllowed: true,
      productionAuthorityAllowed: true,
      outboundAttackCapabilityAllowed: true,
      hackBackAllowed: true,
      humanIdentityClaimFromNetworkSignalAllowed: true,
    })).toEqual(expect.arrayContaining([
      'Lantern must remain isolated.',
      'Lantern cannot contain real user or production data.',
      'Lantern cannot hold production authority.',
      'Lantern cannot provide outbound attack capability.',
      'Lantern cannot hack back.',
      'Lantern cannot claim a human identity from network signals alone.',
    ]));
  });

  it('requires exact-head evidence, rollback, provider authority, and bound approval for privileged security work', () => {
    expect(validateStrategicSecurityExecution({
      expectedHeadSha: 'a'.repeat(40),
      rollback: 'Revert the focused commit and restore the prior provider policy.',
      proofRequirements: ['focused tests', 'runtime evidence'],
      requestedAuthority: 'privileged',
      approvalBound: true,
      providerAuthorityDeclared: true,
    })).toEqual([]);

    expect(validateStrategicSecurityExecution({
      expectedHeadSha: 'main',
      rollback: '',
      proofRequirements: [],
      requestedAuthority: 'privileged',
      approvalBound: false,
      providerAuthorityDeclared: false,
    })).toEqual(expect.arrayContaining([
      'Strategic security execution requires an exact 40-character Git SHA.',
      'Strategic security execution requires an explicit rollback path.',
      'Strategic security execution requires declared proof requirements.',
      'Provider authority must be declared before non-reasoning security execution.',
      'Privileged strategic security execution requires approval bound to the exact plan and head.',
    ]));
  });

  it('uses minimum defensive force instead of treating every anomaly as an attack', () => {
    expect(strategicSecurityDecision({ risk: 'low', evidenceConfidence: 'low', privilegedAction: false, containmentAvailable: true })).toBe('allow');
    expect(strategicSecurityDecision({ risk: 'medium', evidenceConfidence: 'medium', privilegedAction: false, containmentAvailable: true })).toBe('limit');
    expect(strategicSecurityDecision({ risk: 'high', evidenceConfidence: 'low', privilegedAction: false, containmentAvailable: true })).toBe('challenge');
    expect(strategicSecurityDecision({ risk: 'critical', evidenceConfidence: 'high', privilegedAction: true, containmentAvailable: true })).toBe('isolate');
  });
});
