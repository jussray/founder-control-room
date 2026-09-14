import { describe, expect, it } from 'vitest';
import {
  evaluateContentTrendRadar,
  type TrendRadarCandidate,
} from '../contentTrendRadar.js';

function candidate(
  overrides: Partial<TrendRadarCandidate> & Pick<TrendRadarCandidate, 'id' | 'trend'>,
): TrendRadarCandidate {
  return {
    id: overrides.id,
    trend: overrides.trend,
    evidenceState: overrides.evidenceState ?? 'EMERGING_SIGNAL',
    evidenceRefs: overrides.evidenceRefs ?? [{ id: `source:${overrides.id}` }],
    saturation: overrides.saturation ?? 'EARLY',
    scores: overrides.scores ?? {
      timeliness: 80,
      audienceInterest: 80,
      contentPotential: 80,
      founderFit: 80,
      revenueRelevance: 80,
      competitionOpportunity: 80,
    },
    angles: overrides.angles ?? [
      { kind: 'CONTRARIAN', thesis: 'Challenge the obvious framing.' },
      { kind: 'PRACTICAL', thesis: 'Show the usable workflow.' },
      { kind: 'FUTURE', thesis: 'Explain what changes next.' },
    ],
    fingerprint: overrides.fingerprint,
  };
}

describe('evaluateContentTrendRadar', () => {
  it('prefers an early evidence-backed founder-fit signal over an oversaturated high-interest topic', () => {
    const early = candidate({
      id: 'early',
      trend: 'Evidence-backed agent operations',
      scores: {
        timeliness: 92,
        audienceInterest: 80,
        contentPotential: 90,
        founderFit: 98,
        revenueRelevance: 94,
        competitionOpportunity: 88,
      },
    });
    const crowded = candidate({
      id: 'crowded',
      trend: 'Generic viral AI tricks',
      evidenceState: 'VERIFIED',
      saturation: 'OVERSATURATED',
      scores: {
        timeliness: 94,
        audienceInterest: 100,
        contentPotential: 96,
        founderFit: 55,
        revenueRelevance: 55,
        competitionOpportunity: 20,
      },
    });

    const result = evaluateContentTrendRadar([crowded, early]);

    expect(result.ranked[0]?.id).toBe('early');
    expect(result.firstWave[0]?.id).toBe('early');
    expect(result.ranked.find((item) => item.id === 'crowded')?.reasons).toContain('oversaturated');
  });

  it('penalizes a near-duplicate fingerprint instead of blindly repeating a winning pattern', () => {
    const fresh = candidate({ id: 'fresh', trend: 'Fresh founder proof format' });
    const duplicate = candidate({
      id: 'duplicate',
      trend: 'Repeated breakout structure',
      fingerprint: { fingerprintId: 'house-post-control', similarity: 93 },
    });

    const result = evaluateContentTrendRadar([duplicate, fresh]);
    const duplicateResult = result.ranked.find((item) => item.id === 'duplicate');

    expect(result.ranked[0]?.id).toBe('fresh');
    expect(duplicateResult?.reasons).toContain('near_duplicate_fingerprint');
    expect(duplicateResult?.score).toBeLessThan(result.ranked[0]!.score);
  });

  it('keeps prediction-only and evidence-less ideas out of the first wave', () => {
    const prediction = candidate({
      id: 'prediction',
      trend: 'Unproven future shift',
      evidenceState: 'PREDICTION',
    });
    const noEvidence = candidate({
      id: 'no-evidence',
      trend: 'Unsourced claim',
      evidenceRefs: [],
    });
    const sourced = candidate({ id: 'sourced', trend: 'Sourced early signal' });

    const result = evaluateContentTrendRadar([prediction, noEvidence, sourced]);

    expect(result.firstWave.map((item) => item.id)).toEqual(['sourced']);
    expect(result.ranked.find((item) => item.id === 'prediction')?.reasons).toContain('prediction_only');
    expect(result.ranked.find((item) => item.id === 'no-evidence')?.reasons).toContain('missing_evidence');
  });

  it('requires contrarian, practical, and future angles before a candidate enters the first wave', () => {
    const incomplete = candidate({
      id: 'incomplete',
      trend: 'Good signal with incomplete content framing',
      angles: [{ kind: 'PRACTICAL', thesis: 'Show the workflow.' }],
    });

    const result = evaluateContentTrendRadar([incomplete]);

    expect(result.firstWave).toEqual([]);
    expect(result.ranked[0]?.reasons).toContain('missing_required_angles');
  });

  it('caps the first wave deterministically and never grants external-action authority', () => {
    const result = evaluateContentTrendRadar([
      candidate({ id: 'c', trend: 'C' }),
      candidate({ id: 'a', trend: 'A' }),
      candidate({ id: 'b', trend: 'B' }),
      candidate({ id: 'd', trend: 'D' }),
    ]);

    expect(result.firstWave.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(result.authority).toEqual({
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
    });
  });
});
