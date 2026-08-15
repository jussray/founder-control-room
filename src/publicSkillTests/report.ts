import {
  PUBLIC_SKILL_TEST_OUTCOMES,
  type PublicSkillTestOutcome,
  type PublicSkillTestReceipt,
} from "./model.js";
import {
  summarizePublicSkillRound,
  type PublicSkillRoundMetrics,
} from "./analytics.js";

export interface PublicSkillFieldReport {
  campaignId: string;
  metrics: PublicSkillRoundMetrics;
  outcomeCounts: Record<PublicSkillTestOutcome, number>;
  publicSafeTests: number;
  restrictedTests: number;
}

export function buildPublicSkillFieldReport(
  campaignId: string,
  receipts: PublicSkillTestReceipt[],
  impressions: number,
  priorReceipts: PublicSkillTestReceipt[] = [],
): PublicSkillFieldReport {
  const campaignReceipts = receipts.filter(
    (receipt) => receipt.campaignId === campaignId,
  );

  const outcomeCounts = Object.fromEntries(
    PUBLIC_SKILL_TEST_OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<PublicSkillTestOutcome, number>;

  for (const receipt of campaignReceipts) {
    outcomeCounts[receipt.outcome] += 1;
  }

  return {
    campaignId,
    metrics: summarizePublicSkillRound(
      campaignReceipts,
      impressions,
      priorReceipts,
    ),
    outcomeCounts,
    publicSafeTests: campaignReceipts.filter((receipt) => receipt.publicSafe).length,
    restrictedTests: campaignReceipts.filter((receipt) => !receipt.publicSafe).length,
  };
}
