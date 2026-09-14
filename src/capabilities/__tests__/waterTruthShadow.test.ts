import { describe, expect, it } from 'vitest';
import {
  evaluateWaterTruthShadow,
  parseWaterTruthShadowInput,
  WATERTRUTH_SHADOW_CONTRACT,
  type WaterTruthEvidenceSignal,
  type WaterTruthShadowInput,
} from '../waterTruthShadow.js';

const EVALUATED_AT = '2026-09-13T23:55:00.000Z';

function signal(
  kind: WaterTruthEvidenceSignal['kind'],
  state: WaterTruthEvidenceSignal['state'] = 'VERIFIED',
  overrides: Partial<WaterTruthEvidenceSignal> = {},
): WaterTruthEvidenceSignal {
  return {
    kind,
    state,
    observedAt: '2026-09-13T23:54:00.000Z',
    evidenceRef: `evidence:${kind}:1`,
    staleAfterSeconds: 600,
    ...overrides,
  };
}

function baseInput(overrides: Partial<WaterTruthShadowInput> = {}): WaterTruthShadowInput {
  return {
    actionId: 'watertruth:shadow-action:1',
    actionClass: 'REVERSIBLE_OPERATIONAL_ADJUSTMENT',
    proposedAction: 'Evaluate a simulated 3% pump setpoint adjustment.',
    evaluatedAt: EVALUATED_AT,
    evidence: [
      signal('telemetry_integrity'),
      signal('calibration'),
      signal('model_domain'),
      signal('operator_approval'),
    ],
    ...overrides,
  };
}

describe('WaterTruth evidence-gated authority shadow', () => {
  it('permits only simulated supervised-action eligibility when all operational evidence is verified', () => {
    const receipt = evaluateWaterTruthShadow(baseInput());

    expect(receipt.contract).toBe(WATERTRUTH_SHADOW_CONTRACT);
    expect(receipt.evidenceDisposition).toBe('VERIFIED');
    expect(receipt.shadowAuthority).toBe('SUPERVISED_ACTION');
    expect(receipt.shadowDisposition).toBe('SUPERVISED_ACTION_ELIGIBLE');
    expect(receipt.failureReceipts).toEqual([]);
    expect(receipt.shadowOnly).toBe(true);
    expect(receipt.mutationAllowed).toBe(false);
    expect(receipt.liveWaterControlAllowed).toBe(false);
    expect(receipt.physicalActuationAttempted).toBe(false);
    expect(receipt.potabilityClaimAllowed).toBe(false);
    expect(receipt.continuity.authorityEffect).toBe('none');
  });

  it('downgrades authority when calibration is stale and operator approval is unknown', () => {
    const receipt = evaluateWaterTruthShadow(baseInput({
      evidence: [
        signal('telemetry_integrity'),
        signal('calibration', 'VERIFIED', {
          observedAt: '2026-09-13T23:30:00.000Z',
          staleAfterSeconds: 300,
        }),
        signal('model_domain'),
        signal('operator_approval', 'UNKNOWN'),
      ],
    }));

    expect(receipt.evidenceDisposition).toBe('UNKNOWN');
    expect(receipt.shadowAuthority).toBe('OBSERVE');
    expect(receipt.shadowDisposition).toBe('HOLD_FOR_EVIDENCE');
    expect(receipt.failureReceipts.map((failure) => failure.id)).toEqual([
      'stale-evidence:calibration',
      'unknown-evidence:operator_approval',
    ]);
  });

  it('never collapses distinct evidence failures into one receipt', () => {
    const receipt = evaluateWaterTruthShadow(baseInput({
      evidence: [
        signal('telemetry_integrity', 'CONTRADICTED'),
        signal('calibration', 'DEGRADED'),
      ],
    }));

    expect(receipt.evidenceDisposition).toBe('CONTRADICTED');
    expect(receipt.shadowDisposition).toBe('HOLD_FOR_EVIDENCE');
    expect(receipt.failureReceipts.map((failure) => failure.id)).toEqual([
      'contradicted-evidence:telemetry_integrity',
      'degraded-evidence:calibration',
      'missing-evidence:model_domain',
      'missing-evidence:operator_approval',
    ]);
    expect(new Set(receipt.failureReceipts.map((failure) => failure.id)).size).toBe(4);
  });

  it('blocks ambiguous duplicate evidence from elevating authority', () => {
    const receipt = evaluateWaterTruthShadow(baseInput({
      evidence: [
        signal('telemetry_integrity'),
        signal('calibration'),
        signal('calibration', 'VERIFIED', { evidenceRef: 'evidence:calibration:2' }),
        signal('model_domain'),
        signal('operator_approval'),
      ],
    }));

    expect(receipt.evidenceDisposition).toBe('UNKNOWN');
    expect(receipt.shadowAuthority).toBe('OBSERVE');
    expect(receipt.shadowDisposition).toBe('HOLD_FOR_EVIDENCE');
    expect(receipt.failureReceipts.map((failure) => failure.id)).toContain('duplicate-evidence:calibration');
  });

  it('keeps potability claims behind qualified human verification even when review evidence is complete', () => {
    const receipt = evaluateWaterTruthShadow(baseInput({
      actionClass: 'POTABILITY_CLAIM',
      proposedAction: 'Assess whether the evidence packet is ready for qualified human safety review.',
      evidence: [
        signal('telemetry_integrity'),
        signal('calibration'),
        signal('independent_verification'),
        signal('qualified_reviewer'),
      ],
    }));

    expect(receipt.evidenceDisposition).toBe('VERIFIED');
    expect(receipt.claimReviewReady).toBe(true);
    expect(receipt.shadowAuthority).toBe('OBSERVE');
    expect(receipt.shadowDisposition).toBe('HUMAN_VERIFICATION_REQUIRED');
    expect(receipt.potabilityClaimAllowed).toBe(false);
    expect(receipt.liveWaterControlAllowed).toBe(false);
  });

  it('retains separate missing receipts when potability-review evidence is incomplete', () => {
    const receipt = evaluateWaterTruthShadow(baseInput({
      actionClass: 'POTABILITY_CLAIM',
      proposedAction: 'Assess whether the evidence packet is ready for qualified human safety review.',
      evidence: [
        signal('telemetry_integrity'),
        signal('calibration'),
      ],
    }));

    expect(receipt.claimReviewReady).toBe(false);
    expect(receipt.shadowDisposition).toBe('HOLD_FOR_EVIDENCE');
    expect(receipt.failureReceipts.map((failure) => failure.id)).toEqual([
      'missing-evidence:independent_verification',
      'missing-evidence:qualified_reviewer',
    ]);
  });

  it('changes fingerprints when evidence changes and reports bidirectional continuity without authority', () => {
    const first = evaluateWaterTruthShadow(baseInput());
    const confirmed = evaluateWaterTruthShadow(baseInput({
      priorEvidenceFingerprint: first.continuity.evidenceFingerprint,
      priorProofCookie: first.continuity.proofCookie,
    }));
    const changed = evaluateWaterTruthShadow(baseInput({
      evidence: [
        signal('telemetry_integrity'),
        signal('calibration'),
        signal('model_domain', 'DEGRADED'),
        signal('operator_approval'),
      ],
      priorEvidenceFingerprint: first.continuity.evidenceFingerprint,
      priorProofCookie: first.continuity.proofCookie,
    }));

    expect(confirmed.continuity.transition).toBe('confirmed');
    expect(confirmed.continuity.authorityEffect).toBe('none');
    expect(changed.continuity.transition).toBe('changed');
    expect(changed.continuity.evidenceFingerprint).not.toBe(first.continuity.evidenceFingerprint);
    expect(changed.fingerprint).not.toBe(first.fingerprint);
  });

  it('fails closed on structurally invalid runtime input', () => {
    expect(() => parseWaterTruthShadowInput({
      actionId: 'bad',
      actionClass: 'LIVE_OVERRIDE',
      proposedAction: 'Do something unsupported.',
      evaluatedAt: EVALUATED_AT,
      evidence: [],
    })).toThrow(/actionClass is unsupported/);
  });
});