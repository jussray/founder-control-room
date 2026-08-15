import { describe, expect, it } from "vitest";

import type { PublicSkillTestReceipt } from "../model.js";
import { buildPublicSkillFieldReport } from "../report.js";
import { DEVIL_V1_ROUND } from "../rounds.js";

function receipt(
  overrides: Partial<PublicSkillTestReceipt> = {},
): PublicSkillTestReceipt {
  return {
    campaignId: DEVIL_V1_ROUND.campaignId,
    testId: "DEVIL-V1-001",
    submittedAt: "2026-08-15T06:20:00.000Z",
    platform: "linkedin",
    validTest: true,
    outcome: "useful",
    verdict: "revise",
    decisionChanged: "partial",
    testerFoundUseful: "yes",
    vNextCandidate: false,
    publicSafe: true,
    testerKey: "tester-a",
    submissionRef: "sha256:example",
    sanitizedSummary: "safe summary",
    ...overrides,
  };
}

describe("buildPublicSkillFieldReport", () => {
  it("aggregates outcomes without exposing submission content", () => {
    const report = buildPublicSkillFieldReport(
      DEVIL_V1_ROUND.campaignId,
      [
        receipt({ testId: "1", outcome: "useful" }),
        receipt({
          testId: "2",
          outcome: "false-negative",
          publicSafe: false,
          sanitizedSummary: "must not be emitted",
        }),
      ],
      1_000,
    );

    expect(report.outcomeCounts.useful).toBe(1);
    expect(report.outcomeCounts["false-negative"]).toBe(1);
    expect(report.publicSafeTests).toBe(1);
    expect(report.restrictedTests).toBe(1);
    expect(JSON.stringify(report)).not.toContain("must not be emitted");
  });

  it("ignores receipts from other campaigns", () => {
    const report = buildPublicSkillFieldReport(
      DEVIL_V1_ROUND.campaignId,
      [
        receipt({ testId: "devil" }),
        receipt({ campaignId: "other-v1", testId: "other" }),
      ],
      500,
    );

    expect(report.metrics.totalSubmissions).toBe(1);
    expect(report.outcomeCounts.useful).toBe(1);
  });
});
