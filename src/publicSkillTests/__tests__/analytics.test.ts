import { describe, expect, it } from "vitest";

import { summarizePublicSkillRound } from "../analytics.js";
import type { PublicSkillTestReceipt } from "../model.js";
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
    ...overrides,
  };
}

describe("summarizePublicSkillRound", () => {
  it("calculates the three primary campaign KPIs from valid tests only", () => {
    const receipts = [
      receipt({ testId: "1", testerKey: "tester-a", vNextCandidate: true }),
      receipt({ testId: "2", testerKey: "tester-b", vNextCandidate: true }),
      receipt({ testId: "3", testerKey: "tester-c" }),
      receipt({ testId: "4", testerKey: "tester-d" }),
      receipt({ testId: "5", validTest: false, testerKey: "tester-e" }),
    ];

    const metrics = summarizePublicSkillRound(receipts, 1_000);

    expect(metrics.totalSubmissions).toBe(5);
    expect(metrics.validTests).toBe(4);
    expect(metrics.testSubmissionRatePerThousand).toBe(4);
    expect(metrics.iterationYield).toBe(0.5);
  });

  it("measures repeat testers against the prior tester cohort", () => {
    const prior = [
      receipt({ testId: "prior-a", testerKey: "tester-a" }),
      receipt({ testId: "prior-b", testerKey: "tester-b" }),
      receipt({ testId: "prior-c", testerKey: "tester-c" }),
    ];
    const current = [
      receipt({ testId: "current-b", testerKey: "tester-b" }),
      receipt({ testId: "current-c", testerKey: "tester-c" }),
      receipt({ testId: "current-d", testerKey: "tester-d" }),
    ];

    const metrics = summarizePublicSkillRound(current, 500, prior);

    expect(metrics.returningTesters).toBe(2);
    expect(metrics.priorTesters).toBe(3);
    expect(metrics.repeatTesterRate).toBeCloseTo(2 / 3);
  });

  it("returns null instead of inventing rates when no denominator exists", () => {
    const metrics = summarizePublicSkillRound([], 0, []);

    expect(metrics.testSubmissionRatePerThousand).toBeNull();
    expect(metrics.iterationYield).toBeNull();
    expect(metrics.repeatTesterRate).toBeNull();
  });

  it("rejects invalid impression counts", () => {
    expect(() => summarizePublicSkillRound([], -1)).toThrow(
      "impressions must be a finite non-negative number",
    );
  });

  it("binds the first instrumented round to the real public devil skill", () => {
    expect(DEVIL_V1_ROUND).toMatchObject({
      campaignId: "devil-v1-20260815",
      skillName: "/devil",
      skillVersion: "1.0.0",
      proofPath: "skills/devil/SKILL.md",
    });
  });
});
