import type { RulesetConfig } from "./RepositoryProvider.js";

export const FCR_GOVERNANCE_PHASES = ["founder_only", "independent_review"] as const;
export type FcrGovernancePhase = (typeof FCR_GOVERNANCE_PHASES)[number];

export type PhaseAwareRulesetConfig = RulesetConfig & {
  governancePhase?: FcrGovernancePhase;
};

export function readFcrGovernancePhase(config: RulesetConfig): FcrGovernancePhase | null {
  const phase = (config as PhaseAwareRulesetConfig).governancePhase;
  return FCR_GOVERNANCE_PHASES.includes(phase as FcrGovernancePhase)
    ? phase as FcrGovernancePhase
    : null;
}

export function independentReviewRequired(config: RulesetConfig): boolean {
  return readFcrGovernancePhase(config) === "independent_review";
}

export function fcrGovernancePhaseErrors(config: RulesetConfig): string[] {
  const errors: string[] = [];
  const phase = readFcrGovernancePhase(config);
  if (!phase) {
    errors.push("governancePhase must be founder_only or independent_review");
    return errors;
  }

  if (!Number.isInteger(config.requiredApprovingReviewCount)) {
    errors.push("required approving review count must be an integer");
  } else if (phase === "founder_only" && config.requiredApprovingReviewCount !== 0) {
    errors.push("founder_only requires exactly zero outside approving reviews");
  } else if (phase === "independent_review" && config.requiredApprovingReviewCount < 1) {
    errors.push("independent_review requires at least one approving review");
  }

  return errors;
}
