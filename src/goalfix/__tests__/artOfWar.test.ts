import { describe, expect, it } from 'vitest';
import {
  assessArtOfWar,
  validateArtOfWarContinuity,
  type ArtOfWarAssessmentInput,
} from '../artOfWar.js';

const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);

function input(overrides: Partial<ArtOfWarAssessmentInput> = {}): ArtOfWarAssessmentInput {
  return {
    repository: 'jussray/founder-control-room',
    targetBranch: 'main',
    baseSha: BASE,
    currentMainSha: BASE,
    goal: 'Ship the smallest verified repair without widening authority.',
    groundFacts: ['Exact main is known', 'Rollback exists'],
    unknowns: [],
    verifiedAsymmetries: ['Existing focused tests already cover the touched surface'],
    options: [
      {
        id: 'focused-fix',
        label: 'Patch the one verified cause and rerun focused proof',
        expectedValue: 5,
        evidenceStrength: 5,
        reversibility: 5,
        siegeCost: 1,
        uncertainty: 1,
        dependencyCost: 1,
        preservesFutureOptions: true,
        evidenceIds: ['test:focused'],
      },
      {
        id: 'rewrite',
        label: 'Rewrite the subsystem',
        expectedValue: 4,
        evidenceStrength: 1,
        reversibility: 1,
        siegeCost: 5,
        uncertainty: 5,
        dependencyCost: 5,
        preservesFutureOptions: false,
        evidenceIds: ['spec:rewrite'],
      },
    ],
    proofOfAdvantage: ['focused test exists'],
    observedAt: '2026-09-03T22:45:00.000Z',
    ...overrides,
  };
}

describe('assessArtOfWar', () => {
  it('selects the highest-value verified reversible option and emits a non-authorizing continuity cookie', () => {
    const assessment = assessArtOfWar(input());

    expect(assessment.state).toBe('READY');
    expect(assessment.maneuver).toBe('EXPLOIT_VERIFIED_ASYMMETRY');
    expect(assessment.selectedOptionId).toBe('focused-fix');
    expect(assessment.continuityCookie.cookieId.startsWith('aowc:')).toBe(true);
    expect(assessment.continuityCookie.assessmentFingerprint).toBe(assessment.fingerprint);
    expect(assessment.continuityCookie.browserCookie).toBe(false);
    expect(assessment.continuityCookie.authorizing).toBe(false);
    expect(assessment.continuityCookie.approvalCarryForward).toBe(false);
    expect(assessment.continuityCookie.standingMutationAuthority).toBe(false);
    expect(validateArtOfWarContinuity(assessment)).toEqual([]);
  });

  it('refuses movement when the observed base is stale', () => {
    const assessment = assessArtOfWar(input({ currentMainSha: HEAD }));

    expect(assessment.state).toBe('HOLD');
    expect(assessment.maneuver).toBe('REACQUIRE_GROUND');
    expect(assessment.mayProceed).toBe(false);
    expect(assessment.nextAction).toContain('Reacquire current main');
  });

  it('avoids a siege even when it is the only offered path', () => {
    const assessment = assessArtOfWar(input({
      verifiedAsymmetries: [],
      proofOfAdvantage: [],
      options: [
        {
          id: 'siege',
          label: 'Large cross-provider rewrite',
          expectedValue: 3,
          evidenceStrength: 2,
          reversibility: 1,
          siegeCost: 5,
          uncertainty: 4,
          dependencyCost: 5,
          preservesFutureOptions: false,
          evidenceIds: ['spec:rewrite'],
        },
      ],
    }));

    expect(assessment.state).toBe('HOLD');
    expect(assessment.maneuver).toBe('AVOID_SIEGE');
    expect(assessment.doNotFight.join(' ')).toContain('selected high-siege option siege');
    expect(assessment.doNotFight.join(' ')).toContain('continuity cookie');
  });

  it('keeps semantic fingerprint stable while minting a fresh successor cookie', () => {
    const first = assessArtOfWar(input());
    const second = assessArtOfWar(input({
      predecessorCookieId: first.continuityCookie.cookieId,
      observedAt: '2026-09-03T22:50:00.000Z',
    }));

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.continuityCookie.cookieId).not.toBe(first.continuityCookie.cookieId);
    expect(second.continuityCookie.predecessorCookieId).toBe(first.continuityCookie.cookieId);
    expect(validateArtOfWarContinuity(second, first.continuityCookie)).toEqual([]);
    expect(second.continuityCookie.authorizing).toBe(false);
  });

  it('rejects reversed continuity time', () => {
    const first = assessArtOfWar(input({ observedAt: '2026-09-03T22:50:00.000Z' }));
    const second = assessArtOfWar(input({
      predecessorCookieId: first.continuityCookie.cookieId,
      observedAt: '2026-09-03T22:45:00.000Z',
    }));

    expect(validateArtOfWarContinuity(second, first.continuityCookie)).toContain(
      'continuity successor cannot predate predecessor',
    );
  });

  it('detects source-fingerprint tampering', () => {
    const assessment = assessArtOfWar(input());
    const tampered = {
      ...assessment,
      continuityCookie: {
        ...assessment.continuityCookie,
        sourceFingerprint: 'tampered',
      },
    };

    expect(validateArtOfWarContinuity(tampered)).toContain('continuity source fingerprint mismatch');
  });

  it('requires evidence IDs for claimed evidence strength', () => {
    const assessment = assessArtOfWar(input({
      options: [
        {
          id: 'unsupported',
          label: 'Claim evidence without an evidence record',
          expectedValue: 5,
          evidenceStrength: 5,
          reversibility: 5,
          siegeCost: 1,
          uncertainty: 1,
          dependencyCost: 1,
          preservesFutureOptions: true,
          evidenceIds: [],
        },
      ],
    }));

    expect(assessment.state).toBe('HOLD');
    expect(assessment.errors).toContain('nonzero option evidence strength requires at least one evidence ID');
  });

  it('fails closed on malformed ground identity', () => {
    const assessment = assessArtOfWar(input({ baseSha: 'main' }));

    expect(assessment.state).toBe('HOLD');
    expect(assessment.position).toBe('UNKNOWN');
    expect(assessment.errors).toContain('base and current main must be exact 40-character SHAs');
  });
});
