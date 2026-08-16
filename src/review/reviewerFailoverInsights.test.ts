import { describe, expect, it } from "vitest";
import type {
  ReviewerCandidate,
  ReviewerFailoverPolicy,
  ReviewerFailoverRunResult,
} from "./reviewerFailoverBroker.js";
import {
  aggregateReviewerFailoverKpis,
  buildReviewerFailoverControlRoomView,
} from "./reviewerFailoverInsights.js";

const HEAD = "a".repeat(40);
const HASH = "b".repeat(64);

const CODEX: ReviewerCandidate = {
  reviewerId: "codex-reviewer",
  provider: "openai",
  runtime: "codex",
};
const CLAUDE: ReviewerCandidate = {
  reviewerId: "claude-reviewer",
  provider: "anthropic",
  runtime: "claude",
};

const policy: ReviewerFailoverPolicy = {
  orderedReviewers: [CODEX, CLAUDE],
  requiredClearReviews: 1,
  maxFallbacks: 1,
};

function run(
  state: ReviewerFailoverRunResult["decision"]["state"],
  attempts: ReviewerFailoverRunResult["attempts"],
): ReviewerFailoverRunResult {
  const unavailableAttempts = attempts.filter((attempt) => attempt.state === "unavailable").length;
  const clearReviewerIds = attempts
    .filter((attempt) => attempt.state === "clear")
    .map((attempt) => attempt.reviewerId);
  return {
    attempts,
    decision: {
      state,
      nextReviewer: state === "awaiting_review" ? CLAUDE : null,
      clearReviewerIds,
      attemptedReviewerIds: attempts.map((attempt) => attempt.reviewerId),
      blockers: state === "blocked" || state === "exhausted" ? ["hold"] : [],
      telemetry: {
        totalAttempts: attempts.length,
        clearAttempts: clearReviewerIds.length,
        unavailableAttempts,
        blockingAttempts: attempts.filter((attempt) =>
          attempt.state === "blocked" || attempt.state === "needs_review" || attempt.state === "error"
        ).length,
        fallbackDepth: unavailableAttempts,
        fallbackUsed: unavailableAttempts > 0,
      },
    },
  };
}

describe("reviewer failover control-room insights", () => {
  it("shows a degraded-but-satisfied gate when fallback recovers an unavailable primary", () => {
    const result = run("satisfied", [
      { ...CODEX, headSha: HEAD, state: "unavailable", reasonCode: "quota" },
      { ...CLAUDE, headSha: HEAD, state: "clear", reviewHash: HASH },
    ]);

    expect(buildReviewerFailoverControlRoomView(HEAD, policy, result)).toEqual({
      exactHeadSha: HEAD,
      state: "satisfied",
      tone: "degraded",
      primaryReviewerId: "codex-reviewer",
      activeReviewerId: null,
      finalReviewerId: "claude-reviewer",
      quorum: { clear: 1, required: 1, remaining: 0 },
      fallback: {
        used: true,
        depth: 1,
        lastAvailabilityReason: "quota",
      },
      mergeAuthority: "review_gate_satisfied",
      message: "Review gate satisfied by fallback after 1 unavailable reviewer(s).",
    });
  });

  it("keeps merge authority on hold while a fallback reviewer is active", () => {
    const result = run("awaiting_review", [
      { ...CODEX, headSha: HEAD, state: "unavailable", reasonCode: "provider_outage" },
    ]);
    const view = buildReviewerFailoverControlRoomView(HEAD, policy, result);

    expect(view.tone).toBe("degraded");
    expect(view.activeReviewerId).toBe("claude-reviewer");
    expect(view.mergeAuthority).toBe("hold");
    expect(view.quorum).toEqual({ clear: 0, required: 1, remaining: 1 });
  });

  it("reports KPI denominators explicitly and never turns missing data into zero", () => {
    expect(aggregateReviewerFailoverKpis([], policy)).toMatchObject({
      runs: 0,
      runsWithAttempts: 0,
      reviewGateSatisfactionRate: null,
      fallbackActivationRate: null,
      fallbackRecoveryRate: null,
      exhaustionRate: null,
      primaryUnavailabilityRate: null,
      meanFallbackDepth: null,
      reviewerAvailability: [],
    });
  });

  it("measures fallback activation, recovery, exhaustion, and reviewer availability from observed runs", () => {
    const results = [
      run("satisfied", [
        { ...CODEX, headSha: HEAD, state: "clear", reviewHash: HASH },
      ]),
      run("satisfied", [
        { ...CODEX, headSha: HEAD, state: "unavailable", reasonCode: "quota" },
        { ...CLAUDE, headSha: HEAD, state: "clear", reviewHash: "c".repeat(64) },
      ]),
      run("exhausted", [
        { ...CODEX, headSha: HEAD, state: "unavailable", reasonCode: "rate_limit" },
        { ...CLAUDE, headSha: HEAD, state: "unavailable", reasonCode: "provider_outage" },
      ]),
    ];

    const metrics = aggregateReviewerFailoverKpis(results, policy);
    expect(metrics).toMatchObject({
      runs: 3,
      runsWithAttempts: 3,
      satisfiedRuns: 2,
      fallbackRuns: 2,
      exhaustedRuns: 1,
      reviewGateSatisfactionRate: 2 / 3,
      fallbackActivationRate: 2 / 3,
      fallbackRecoveryRate: 1 / 2,
      exhaustionRate: 1 / 3,
      primaryUnavailabilityRate: 2 / 3,
      meanFallbackDepth: 1,
    });
    expect(metrics.reviewerAvailability).toEqual([
      {
        reviewerId: "claude-reviewer",
        attempts: 2,
        unavailableAttempts: 1,
        availabilityRate: 0.5,
      },
      {
        reviewerId: "codex-reviewer",
        attempts: 3,
        unavailableAttempts: 2,
        availabilityRate: 1 / 3,
      },
    ]);
  });
});
