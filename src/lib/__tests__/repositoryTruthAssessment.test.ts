import { describe, expect, it } from "vitest";
import { assessRepositoryTruth } from "../repositoryTruthAssessment.js";

const NOW = new Date("2026-08-15T02:00:00.000Z");

function base(overrides = {}) {
  return {
    latestRun: {
      overall_status: "passed",
      signature_verified: true,
      received_at: "2026-08-15T01:55:00.000Z",
    },
    verificationCadenceMinutes: 15,
    findings: { total: 0, critical: 0, high: 0 },
    capabilities: {
      total: 4,
      verified: 4,
      drifted: 0,
      unverified: 0,
      failedUsageAssertions: 0,
    },
    openMissionCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe("assessRepositoryTruth", () => {
  it("returns unknown when no receipt exists", () => {
    const result = assessRepositoryTruth(base({ latestRun: null }));

    expect(result.state).toBe("unknown");
    expect(result.freshness).toBe("missing");
    expect(result.recommendation).toBe("hold");
    expect(result.confidence).toBe(0);
    expect(result.mutationAuthorized).toBe(false);
  });

  it("refuses to reuse a passed receipt after the freshness window", () => {
    const result = assessRepositoryTruth(base({
      latestRun: {
        overall_status: "passed",
        signature_verified: true,
        received_at: "2026-08-15T01:00:00.000Z",
      },
    }));

    expect(result.state).toBe("stale");
    expect(result.freshness).toBe("stale");
    expect(result.recommendation).toBe("hold");
    expect(result.confidence).toBeLessThanOrEqual(40);
    expect(result.nextAction).toContain("Verify now");
  });

  it("routes fresh failed evidence to founder review", () => {
    const result = assessRepositoryTruth(base({
      latestRun: {
        overall_status: "failed",
        signature_verified: true,
        received_at: "2026-08-15T01:55:00.000Z",
      },
      findings: { total: 1, critical: 0, high: 1 },
      openMissionCount: 1,
    }));

    expect(result.state).toBe("attention");
    expect(result.recommendation).toBe("review");
    expect(result.nextAction).toContain("active bounded repair mission");
    expect(result.promotionAllowed).toBe(false);
  });

  it("does not treat unsigned green evidence as verified truth", () => {
    const result = assessRepositoryTruth(base({
      latestRun: {
        overall_status: "passed",
        signature_verified: false,
        received_at: "2026-08-15T01:55:00.000Z",
      },
    }));

    expect(result.state).toBe("attention");
    expect(result.reasons).toContain("Latest evidence is not signature-verified.");
    expect(result.confidence).toBeLessThanOrEqual(60);
  });

  it("marks fresh signed complete evidence verified but keeps promotion founder-gated", () => {
    const result = assessRepositoryTruth(base());

    expect(result.state).toBe("verified");
    expect(result.freshness).toBe("fresh");
    expect(result.evidenceCompleteness).toBe(100);
    expect(result.recommendation).toBe("candidate-promote");
    expect(result.confidence).toBe(90);
    expect(result.founderReviewRequired).toBe(true);
    expect(result.promotionAllowed).toBe(false);
    expect(result.mutationAuthorized).toBe(false);
  });

  it("rejects receipts with implausible future timestamps", () => {
    const result = assessRepositoryTruth(base({
      latestRun: {
        overall_status: "passed",
        signature_verified: true,
        received_at: "2026-08-15T02:30:00.000Z",
      },
    }));

    expect(result.state).toBe("unknown");
    expect(result.freshness).toBe("invalid");
    expect(result.recommendation).toBe("hold");
  });
});
