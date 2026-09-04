import type { RulesetConfig } from "./RepositoryProvider.js";

export const FCR_GOVERNANCE_PHASES = ["founder_only", "independent_review"] as const;
export type FcrGovernancePhase = (typeof FCR_GOVERNANCE_PHASES)[number];

export type PhaseAwareRulesetConfig = RulesetConfig & {
  governancePhase?: FcrGovernancePhase;
};

/**
 * An explicit phase is required to enter founder_only. Historical FCR configs
 * with >=1 approval remain compatible and resolve to independent_review, so
 * this governance repair cannot accidentally reinterpret an old request as a
 * weaker policy.
 */
export function readFcrGovernancePhase(config: RulesetConfig): FcrGovernancePhase | null {
  const explicit = (config as PhaseAwareRulesetConfig).governancePhase;
  if (FCR_GOVERNANCE_PHASES.includes(explicit as FcrGovernancePhase)) {
    return explicit as FcrGovernancePhase;
  }
  return Number.isInteger(config.requiredApprovingReviewCount)
    && config.requiredApprovingReviewCount >= 1
    ? "independent_review"
    : null;
}

export function independentReviewRequired(config: RulesetConfig): boolean {
  return readFcrGovernancePhase(config) === "independent_review";
}

export function fcrGovernancePhaseErrors(config: RulesetConfig): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(config.requiredApprovingReviewCount)) {
    errors.push("required approving review count must be an integer");
    return errors;
  }

  const phase = readFcrGovernancePhase(config);
  if (!phase) {
    errors.push("zero-review FCR governance requires explicit governancePhase=founder_only");
    return errors;
  }

  if (phase === "founder_only" && config.requiredApprovingReviewCount !== 0) {
    errors.push("founder_only requires exactly zero outside approving reviews");
  } else if (phase === "independent_review" && config.requiredApprovingReviewCount < 1) {
    errors.push("independent_review requires at least one approving review");
  }

  return errors;
}
