import { describe, expect, it } from 'vitest';

import {
  ATTACK_3000_AUTHORITY_CEILING,
  type Attack3000Evidence,
  type Attack3000Trigger,
} from '../attack3000.js';
import {
  ATTACK_3000_RELEASE_ADAPTER_ID,
  RELEASE_STAGE_ORDER,
  createReleaseAttack3000Assessment,
  deriveReleaseTerms,
  evaluateReleaseAttack3000,
  type ReleaseAttack3000Input,
  type ReleaseStageObservation,
} from '../attack3000Release.js';

const verifiedSupport = (ref: string): Attack3000Evidence => ({
  classification: 'VERIFIED',
  direction: 'SUPPORTS',
  evidenceRefs: [ref],
});

const verifiedTrigger = (statement: string, triggered = false): Attack3000Trigger => ({
  statement,
  classification: 'VERIFIED',
  triggered,
  evidenceRefs: [`evidence:${statement.replaceAll(' ', '-').toLowerCase()}`],
});

const verifiedStage = (satisfied: boolean, ref: string): ReleaseStageObservation => ({
  satisfied,
  classification: 'VERIFIED',
  evidenceRefs: [ref],
});

function baseline(): ReleaseAttack3000Input {
  return {
    subject: {
      decisionId: 'release-candidate-one',
      projectId: 'project-one',
      portfolioId: 'portfolio-juss',
    },
    terms: {
      source: verifiedStage(true, 'evidence:source-exact-head'),
      artifact: verifiedStage(true, 'evidence:artifact-digest'),
      providerAcceptance: verifiedStage(true, 'evidence:provider-acceptance'),
      runtimeIdentity: verifiedStage(true, 'evidence:runtime-version'),
      userPath: verifiedStage(true, 'evidence:browser-witness'),
      externalOutcome: verifiedStage(true, 'evidence:external-outcome'),
    },
    evidence: {
      valueCreated: verifiedSupport('evidence:release-value'),
      humanOutcome: verifiedSupport('evidence:release-human-outcome'),
      externalDemand: verifiedSupport('evidence:release-demand'),
      economics: verifiedSupport('evidence:release-economics'),
      opportunityCost: verifiedSupport('evidence:release-opportunity-cost'),
      dependencies: verifiedSupport('evidence:release-dependencies'),
      reversibility: verifiedSupport('evidence:release-reversibility'),
      secondOrderEffects: verifiedSupport('evidence:release-second-order'),
      thirdOrderEffects: verifiedSupport('evidence:release-third-order'),
    },
    falsifier: verifiedTrigger('Release thesis is disproved'),
    stopCondition: {
      kind: 'explicit',
      trigger: verifiedTrigger('Release stop condition is crossed'),
    },
  };
}

describe('Attack 3000 release truth-chain adapter', () => {
  it('requires every ordered stage for release-ready truth', () => {
    const result = deriveReleaseTerms(baseline().terms);
    expect(result.classification).toBe('VERIFIED');
    expect(result.releaseReady).toBe(true);
    expect(result.contiguousStage).toBe('external_outcome');
    expect(result.reasons).toEqual([]);
    expect(RELEASE_STAGE_ORDER).toHaveLength(6);
  });

  it('does not promote source green into production truth', () => {
    const input = baseline();
    input.terms.artifact = verifiedStage(false, 'evidence:artifact-missing');
    input.terms.providerAcceptance = verifiedStage(false, 'evidence:provider-not-accepted');
    input.terms.runtimeIdentity = verifiedStage(false, 'evidence:runtime-not-proven');
    input.terms.userPath = verifiedStage(false, 'evidence:user-path-not-proven');
    input.terms.externalOutcome = verifiedStage(false, 'evidence:outcome-not-proven');

    const result = evaluateReleaseAttack3000(input);
    expect(result.terms.releaseReady).toBe(false);
    expect(result.terms.contiguousStage).toBe('source');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('detects later-stage green that skips a missing predecessor', () => {
    const input = baseline();
    input.terms.providerAcceptance = verifiedStage(false, 'evidence:provider-failed');
    input.terms.runtimeIdentity = verifiedStage(true, 'evidence:runtime-claimed');

    const result = evaluateReleaseAttack3000(input);
    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('chain:runtime_identity_without_predecessor');
    expect(result.terms.releaseReady).toBe(false);
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('holds when VERIFIED runtime evidence has no evidence reference', () => {
    const input = baseline();
    input.terms.runtimeIdentity = { ...input.terms.runtimeIdentity, evidenceRefs: [] };

    const result = evaluateReleaseAttack3000(input);
    expect(result.terms.classification).toBe('UNKNOWN');
    expect(result.terms.reasons).toContain('runtime_identity:verified_without_evidence');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('keeps inferred runtime identity from becoming release ready', () => {
    const input = baseline();
    input.terms.runtimeIdentity = { ...input.terms.runtimeIdentity, classification: 'INFERRED' };

    const result = evaluateReleaseAttack3000(input);
    expect(result.terms.classification).toBe('INFERRED');
    expect(result.terms.releaseReady).toBe(false);
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('maps release-chain proof into the canonical dependency dimension', () => {
    const { assessment } = createReleaseAttack3000Assessment(baseline());
    expect(assessment.adapterId).toBe(ATTACK_3000_RELEASE_ADAPTER_ID);
    expect(assessment.subject.domain).toBe('release');
    expect(assessment.dimensions.dependencies?.evidenceRefs).toEqual(
      expect.arrayContaining([
        'evidence:release-dependencies',
        'evidence:source-exact-head',
        'evidence:artifact-digest',
        'evidence:provider-acceptance',
        'evidence:runtime-version',
        'evidence:browser-witness',
        'evidence:external-outcome',
      ]),
    );
  });

  it('supports a verified release chain but grants no merge or deploy authority', () => {
    const result = evaluateReleaseAttack3000(baseline());
    expect(result.evaluation.verdict).toBe('SUPPORTED');
    expect(result.evaluation.authority).toEqual(ATTACK_3000_AUTHORITY_CEILING);
    expect(result.evaluation.authority.authorizesMerge).toBe(false);
    expect(result.evaluation.authority.authorizesDeploy).toBe(false);
  });

  it('holds when provider acceptance is explicitly absent', () => {
    const input = baseline();
    input.terms.providerAcceptance = verifiedStage(false, 'evidence:provider-rejected');
    input.terms.runtimeIdentity = verifiedStage(false, 'evidence:runtime-held');
    input.terms.userPath = verifiedStage(false, 'evidence:user-path-held');
    input.terms.externalOutcome = verifiedStage(false, 'evidence:outcome-held');

    const result = evaluateReleaseAttack3000(input);
    expect(result.terms.contiguousStage).toBe('artifact');
    expect(result.terms.reasons).toContain('provider_acceptance:not_satisfied');
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('holds when the user path is unproven despite verified runtime identity', () => {
    const input = baseline();
    input.terms.userPath = verifiedStage(false, 'evidence:user-path-unproven');
    input.terms.externalOutcome = verifiedStage(false, 'evidence:outcome-not-run');

    const result = evaluateReleaseAttack3000(input);
    expect(result.terms.contiguousStage).toBe('runtime_identity');
    expect(result.terms.releaseReady).toBe(false);
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('falsifies a verified founder stage requirement when that stage is absent', () => {
    const input = baseline();
    input.terms.runtimeIdentity = verifiedStage(false, 'evidence:runtime-mismatch');
    input.terms.userPath = verifiedStage(false, 'evidence:user-path-held');
    input.terms.externalOutcome = verifiedStage(false, 'evidence:outcome-held');
    input.stopCondition = {
      kind: 'stage_required',
      requirement: {
        stage: 'runtime_identity',
        classification: 'VERIFIED',
        evidenceRefs: ['evidence:founder-runtime-requirement'],
      },
    };

    const result = evaluateReleaseAttack3000(input);
    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.reasons).toContain('stop_condition:triggered');
  });

  it('does not let an inferred requirement manufacture a verified stop decision', () => {
    const input = baseline();
    input.terms.runtimeIdentity = {
      satisfied: false,
      classification: 'INFERRED',
      evidenceRefs: ['evidence:runtime-inferred'],
    };
    input.terms.userPath = verifiedStage(false, 'evidence:user-path-held');
    input.terms.externalOutcome = verifiedStage(false, 'evidence:outcome-held');
    input.stopCondition = {
      kind: 'stage_required',
      requirement: {
        stage: 'runtime_identity',
        classification: 'INFERRED',
        evidenceRefs: ['memory:runtime-requirement-not-reconfirmed'],
      },
    };

    const result = evaluateReleaseAttack3000(input);
    expect(result.assessment.stopCondition.triggered).toBe(true);
    expect(result.assessment.stopCondition.classification).toBe('INFERRED');
    expect(result.evaluation.verdict).toBe('HOLD');
    expect(result.evaluation.reasons).toContain('stop_condition:inferred');
    expect(result.evaluation.reasons).not.toContain('stop_condition:triggered');
  });

  it('requires external outcome proof beyond a working user path', () => {
    const input = baseline();
    input.terms.externalOutcome = verifiedStage(false, 'evidence:outcome-not-observed');

    const result = evaluateReleaseAttack3000(input);
    expect(result.terms.contiguousStage).toBe('user_path');
    expect(result.terms.releaseReady).toBe(false);
    expect(result.evaluation.verdict).toBe('HOLD');
  });

  it('preserves an explicit stop without creating execution authority', () => {
    const input = baseline();
    input.stopCondition = {
      kind: 'explicit',
      trigger: verifiedTrigger('Release is explicitly stopped', true),
    };

    const result = evaluateReleaseAttack3000(input);
    expect(result.evaluation.verdict).toBe('FALSIFIED');
    expect(result.evaluation.authority.authorizesMerge).toBe(false);
    expect(result.evaluation.authority.authorizesDeploy).toBe(false);
  });
});
