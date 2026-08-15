import type { PublicSkillTestReceipt } from "./model.js";

export interface PublicSkillRoundMetrics {
  impressions: number;
  totalSubmissions: number;
  validTests: number;
  vNextCandidates: number;
  returningTesters: number;
  priorTesters: number;
  testSubmissionRatePerThousand: number | null;
  iterationYield: number | null;
  repeatTesterRate: number | null;
}

function uniqueTesterKeys(receipts: PublicSkillTestReceipt[]): Set<string> {
  return new Set(
    receipts
      .filter((receipt) => receipt.validTest && receipt.testerKey)
      .map((receipt) => receipt.testerKey as string),
  );
}

export function summarizePublicSkillRound(
  receipts: PublicSkillTestReceipt[],
  impressions: number,
  priorReceipts: PublicSkillTestReceipt[] = [],
): PublicSkillRoundMetrics {
  if (!Number.isFinite(impressions) || impressions < 0) {
    throw new Error("impressions must be a finite non-negative number");
  }

  const validReceipts = receipts.filter((receipt) => receipt.validTest);
  const vNextCandidates = validReceipts.filter((receipt) => receipt.vNextCandidate).length;

  const priorTesterKeys = uniqueTesterKeys(priorReceipts);
  const currentTesterKeys = uniqueTesterKeys(validReceipts);
  const returningTesterKeys = new Set(
    [...currentTesterKeys].filter((testerKey) => priorTesterKeys.has(testerKey)),
  );

  return {
    impressions,
    totalSubmissions: receipts.length,
    validTests: validReceipts.length,
    vNextCandidates,
    returningTesters: returningTesterKeys.size,
    priorTesters: priorTesterKeys.size,
    testSubmissionRatePerThousand:
      impressions > 0 ? (validReceipts.length / impressions) * 1_000 : null,
    iterationYield:
      validReceipts.length > 0 ? vNextCandidates / validReceipts.length : null,
    repeatTesterRate:
      priorTesterKeys.size > 0 ? returningTesterKeys.size / priorTesterKeys.size : null,
  };
}
