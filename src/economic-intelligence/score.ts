import type { OpportunityInput, OpportunitySignals, ScoredOpportunity } from './types.js';

export const SCORE_VERSION = 'economic-opportunity-v1';

export const SCORE_WEIGHTS: Readonly<Record<keyof OpportunitySignals, number>> = {
  impact: 0.3,
  feasibility: 0.25,
  evidence: 0.2,
  urgency: 0.15,
  equity: 0.1,
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function scoreOpportunity(input: OpportunityInput): ScoredOpportunity {
  const score = Object.entries(SCORE_WEIGHTS).reduce((total, [signal, weight]) => {
    const value = clampScore(input.signals[signal as keyof OpportunitySignals]);
    return total + value * weight;
  }, 0);

  const rounded = Math.round(score * 10) / 10;
  const scoreBand = rounded >= 80
    ? 'priority'
    : rounded >= 65
      ? 'promising'
      : rounded >= 45
        ? 'monitor'
        : 'insufficient_evidence';

  return {
    ...input,
    score: rounded,
    scoreBand,
    scoreVersion: SCORE_VERSION,
  };
}
