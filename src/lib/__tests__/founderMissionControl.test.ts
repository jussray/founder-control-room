import { describe, expect, it } from 'vitest';

import {
  FOUNDER_MISSION_CORE_ARTIFACT_IDS,
  FOUNDER_MISSION_ENVELOPE_CONTRACT,
  createFounderMissionSuccessor,
  evaluateFounderMissionClearance,
  founderMissionFingerprint,
  isActionIdSyntaxValid,
  type FounderMissionEnvelope,
  validateFounderMissionEnvelope,
} from '../founderMissionControl.js';

function artifact(artifactId: string, ownerLane: string) {
  return {
    artifactId,
    ownerLane,
    supportLanes: ownerLane === 'founder' ? ['chief-ai'] : ['founder'],
    status: 'active' as const,
    requiredProofLevel: 'exact-head' as const,
    evidenceRefs: [] as string[],
    approvalGate: ownerLane === 'founder' ? 'founder' as const : 'none' as const,
    rollback: 'Discard the focused artifact update.',
  };
}

function baseEnvelope(overrides: Partial<FounderMissionEnvelope> = {}): FounderMissionEnvelope {
  return {
    contract: FOUNDER_MISSION_ENVELOPE_CONTRACT,
    missionId: 'mission-001',
    goal: 'Repair and prove one bounded founder workflow.',
    preservedConstraints: ['Do not collapse Chief into FCR.'],
    who: 'Founder owns final authority; Chief plans; FCR executes and proves.',
    what: 'One bounded workflow repair.',
    where: 'jussray/founder-control-room',
    when: 'Current exact candidate only.',
    why: 'A repeated founder task should become reliable and reusable.',
    how: 'Use the smallest reversible path and retain evidence.',
    systemMap: ['chief-ai -> capability plan', 'fcr -> guarded execution'],
    redTeamRegister: ['identity collapse', 'false green'],
    bottleneckMap: ['proof gate'],
    artifacts: FOUNDER_MISSION_CORE_ARTIFACT_IDS.map((id) => artifact(id, id === 'founder-decision-pack' ? 'founder' : 'founder-control-room')),
    requiredProofLevel: 'exact-head',
    currentProofLevel: 'plan-only',
    proofState: 'unproven',
    taskState: 'proof_pending',
    proofRefs: [],
    rollback: 'Revert the focused mission change.',
    version: 1,
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('founder mission control', () => {
  it('keeps task clearance separate from progress until required proof is proven', () => {
    const pending = baseEnvelope({ currentProofLevel: 'local-evidence', proofRefs: ['local://test/1'] });
    expect(validateFounderMissionEnvelope(pending)).toEqual({ valid: true, errors: [] });
    expect(evaluateFounderMissionClearance(pending)).toEqual({
      proofSatisfied: false,
      clearanceAllowed: false,
      requiredProofLevel: 'exact-head',
      currentProofLevel: 'local-evidence',
      nextGate: 'obtain exact-head proof',
    });

    const proven = baseEnvelope({
      currentProofLevel: 'exact-head',
      proofState: 'proven',
      taskState: 'proven',
      proofRefs: ['github://jussray/founder-control-room/commit/abc'],
    });
    expect(validateFounderMissionEnvelope(proven)).toEqual({ valid: true, errors: [] });
    expect(evaluateFounderMissionClearance(proven).clearanceAllowed).toBe(true);

    const cleared = { ...proven, taskState: 'cleared' as const };
    expect(validateFounderMissionEnvelope(cleared)).toEqual({ valid: true, errors: [] });
  });

  it('rejects false clearance when proof is weaker than the original goal', () => {
    const falseGreen = baseEnvelope({
      currentProofLevel: 'local-evidence',
      proofState: 'proven',
      taskState: 'cleared',
      proofRefs: ['local://looks-good'],
    });

    const result = validateFounderMissionEnvelope(falseGreen);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('proofState cannot be proven before required proof and evidence are satisfied');
    expect(result.errors).toContain('task cannot clear before proof is proven at the required level');
  });

  it('requires the Bip-derived core artifact spine with one non-competing owner lane', () => {
    const missingCore = baseEnvelope({ artifacts: baseEnvelope().artifacts.slice(1) });
    expect(validateFounderMissionEnvelope(missingCore).errors).toContain('missing core artifact mission-brief');

    const competingOwner = baseEnvelope();
    competingOwner.artifacts[0] = {
      ...competingOwner.artifacts[0],
      supportLanes: [competingOwner.artifacts[0].ownerLane],
    };
    expect(validateFounderMissionEnvelope(competingOwner).errors).toContain(
      'artifact mission-brief owner lane cannot also be a support lane',
    );
  });

  it('rejects malformed enum state at the external mission boundary', () => {
    const malformed = baseEnvelope() as unknown as {
      requiredProofLevel: string;
      currentProofLevel: string;
      proofState: string;
      taskState: string;
      artifacts: Array<{
        status: string;
        requiredProofLevel: string;
        approvalGate: string;
      }>;
    };
    malformed.requiredProofLevel = 'source-green';
    malformed.currentProofLevel = 'looks-current';
    malformed.proofState = 'approved';
    malformed.taskState = 'done';
    malformed.artifacts[0].status = 'done';
    malformed.artifacts[0].requiredProofLevel = 'looks-good';
    malformed.artifacts[0].approvalGate = 'model';

    const result = validateFounderMissionEnvelope(malformed as unknown as FounderMissionEnvelope);
    expect(result.errors).toContain('requiredProofLevel is invalid');
    expect(result.errors).toContain('currentProofLevel is invalid');
    expect(result.errors).toContain('proofState is invalid');
    expect(result.errors).toContain('taskState is invalid');
    expect(result.errors).toContain('artifact mission-brief status is invalid');
    expect(result.errors).toContain('artifact mission-brief requiredProofLevel is invalid');
    expect(result.errors).toContain('artifact mission-brief approvalGate is invalid');
  });

  it('creates append-only successor lineage without changing mission identity', () => {
    const prior = baseEnvelope();
    const priorFingerprint = founderMissionFingerprint(prior);
    const successor = createFounderMissionSuccessor(prior, {
      ...prior,
      currentProofLevel: 'local-evidence',
      proofRefs: ['local://focused-test'],
      createdAt: '2026-09-25T00:01:00.000Z',
    });

    expect(prior.version).toBe(1);
    expect(prior.predecessorFingerprint).toBeUndefined();
    expect(successor.version).toBe(2);
    expect(successor.predecessorFingerprint).toBe(priorFingerprint);
    expect(validateFounderMissionEnvelope(successor)).toEqual({ valid: true, errors: [] });

    expect(() => createFounderMissionSuccessor(prior, { ...prior, missionId: 'different-mission' })).toThrow(
      'mission identity cannot change across append-only successors',
    );
  });

  it('accepts only bounded action-ID syntax and leaves registry membership to execution policy', () => {
    expect(isActionIdSyntaxValid('verify:frontend')).toBe(true);
    expect(isActionIdSyntaxValid('recover-system')).toBe(true);
    expect(isActionIdSyntaxValid('npm run verify:frontend')).toBe(false);
    expect(isActionIdSyntaxValid('verify; rm -rf /')).toBe(false);
    expect(isActionIdSyntaxValid('')).toBe(false);
  });
});
