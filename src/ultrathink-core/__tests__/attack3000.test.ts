import { describe, expect, it } from 'vitest';

import {
  ATTACK_3000_AUTHORITY_CEILING,
  ATTACK_3000_REQUIRED_DIMENSIONS,
  ATTACK_3000_SCHEMA,
  evaluateAttack3000,
  type Attack3000Assessment,
  type Attack3000Dimension,
  type Attack3000Evidence,
} from '../attack3000.js';

const verifiedSupport = (ref: string): Attack3000Evidence => ({
  classification: 'VERIFIED',
  direction: 'SUPPORTS',
  evidenceRefs: [ref],
});

function baseline(domain = 'portfolio'): Attack3000Assessment {
  const dimensions = Object.fromEntries(
    ATTACK_3000_REQUIRED_DIMENSIONS.map((dimension) => [
      dimension,
      verifiedSupport(`evidence:${dimension}`),
    ]),
  ) as Record<Attack3000Dimension, Attack3000Evidence>;

  return {
    schema: ATTACK_3000_SCHEMA,
    subject: {
      decisionId: 'decision-1',
      projectId: 'project-1',
      portfolioId: 'portfolio-juss',
      domain,
    },
    adapterId: `${domain}-adapter@v1`,
    dimensions,
    falsifier: {
      statement: 'Stop if verified evidence disproves the load-bearing value thesis.',
      classification: 'VERIFIED',
      triggered: false,
      evidenceRefs: ['evidence:falsifier-observation'],
    },
    stopCondition: {
      statement: 'Stop if the verified cost/risk ceiling is crossed.',
      classification: 'VERIFIED',
      triggered: false,
      evidenceRefs: ['evidence:stop-condition-observation'],
    },
  };
}

describe('Attack 3000 portfolio-wide third-order falsification', () => {
  it('supports a fully verified assessment without granting execution authority', () => {
    const result = evaluateAttack3000(baseline());

    expect(result).toEqual({
      verdict: 'SUPPORTED',
      reasons: [],
      missingDimensions: [],
      authority: ATTACK_3000_AUTHORITY_CEILING,
    });
    expect(Object.values(result.authority).every((value) => value === false)).toBe(true);
  });

  it('holds when any required value/economic dimension is missing', () => {
    const assessment = baseline();
    const dimensions = { ...assessment.dimensions };
    delete dimensions.economics;

    const result = evaluateAttack3000({ ...assessment, dimensions });

    expect(result.verdict).toBe('HOLD');
    expect(result.missingDimensions).toEqual(['economics']);
    expect(result.reasons).toContain('dimension:economics:missing');
  });

  it('holds when load-bearing evidence is inferred instead of verified', () => {
    const assessment = baseline();
    const result = evaluateAttack3000({
      ...assessment,
      dimensions: {
        ...assessment.dimensions,
        external_demand: {
          classification: 'INFERRED',
          direction: 'SUPPORTS',
          evidenceRefs: ['interview-not-yet-reproduced'],
        },
      },
    });

    expect(result.verdict).toBe('HOLD');
    expect(result.reasons).toContain('dimension:external_demand:inferred');
  });

  it('holds on a verified contradiction until an explicit falsifier or stop condition fires', () => {
    const assessment = baseline();
    const result = evaluateAttack3000({
      ...assessment,
      dimensions: {
        ...assessment.dimensions,
        opportunity_cost: {
          classification: 'VERIFIED',
          direction: 'CONTRADICTS',
          evidenceRefs: ['evidence:better-alternative'],
        },
      },
    });

    expect(result.verdict).toBe('HOLD');
    expect(result.reasons).toContain('dimension:opportunity_cost:contradicts');
  });

  it('falsifies only when a verified explicit falsifier is triggered', () => {
    const assessment = baseline();
    const result = evaluateAttack3000({
      ...assessment,
      falsifier: {
        ...assessment.falsifier,
        triggered: true,
        evidenceRefs: ['evidence:falsifier-hit'],
      },
    });

    expect(result.verdict).toBe('FALSIFIED');
    expect(result.reasons).toContain('falsifier:triggered');
    expect(result.authority.authorizesFundraise).toBe(false);
  });

  it('does not promote an inferred trigger into a falsified decision', () => {
    const assessment = baseline();
    const result = evaluateAttack3000({
      ...assessment,
      stopCondition: {
        ...assessment.stopCondition,
        classification: 'INFERRED',
        triggered: true,
      },
    });

    expect(result.verdict).toBe('HOLD');
    expect(result.reasons).toContain('stop_condition:inferred');
  });

  it('requires evidence references for claims labeled VERIFIED', () => {
    const assessment = baseline();
    const result = evaluateAttack3000({
      ...assessment,
      dimensions: {
        ...assessment.dimensions,
        human_outcome: {
          classification: 'VERIFIED',
          direction: 'SUPPORTS',
          evidenceRefs: [],
        },
      },
    });

    expect(result.verdict).toBe('HOLD');
    expect(result.reasons).toContain('dimension:human_outcome:verified_without_evidence');
  });

  it.each(['fundraising', 'commerce', 'release', 'content', 'vendor', 'product']) (
    'keeps verdict semantics identical for the %s adapter',
    (domain) => {
      expect(evaluateAttack3000(baseline(domain)).verdict).toBe('SUPPORTED');
    },
  );
});
