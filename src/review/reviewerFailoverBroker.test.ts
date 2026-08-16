import { describe, expect, it, vi } from "vitest";
import {
  evaluateReviewerFailover,
  runReviewerFailover,
  type ReviewerCandidate,
  type ReviewerFailoverPolicy,
  type ReviewerAttempt,
} from "./reviewerFailoverBroker.js";

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
const CHATGPT: ReviewerCandidate = {
  reviewerId: "chatgpt-reviewer",
  provider: "openai",
  runtime: "chatgpt",
};

const policy: ReviewerFailoverPolicy = {
  orderedReviewers: [CODEX, CLAUDE, CHATGPT],
  requiredClearReviews: 1,
  maxFallbacks: 2,
};

function attempt(
  candidate: ReviewerCandidate,
  state: ReviewerAttempt["state"],
  extras: Partial<ReviewerAttempt> = {},
): ReviewerAttempt {
  return {
    ...candidate,
    headSha: HEAD,
    state,
    ...(state === "clear" ? { reviewHash: HASH } : {}),
    ...extras,
  };
}

describe("reviewer failover broker", () => {
  it("starts with the primary reviewer", () => {
    const result = evaluateReviewerFailover(HEAD, [], policy);
    expect(result.state).toBe("awaiting_review");
    expect(result.nextReviewer).toEqual(CODEX);
    expect(result.telemetry.fallbackUsed).toBe(false);
  });

  it("promotes the next trusted reviewer only for eligible availability failure", () => {
    const result = evaluateReviewerFailover(HEAD, [
      attempt(CODEX, "unavailable", { reasonCode: "quota" }),
    ], policy);

    expect(result.state).toBe("awaiting_review");
    expect(result.nextReviewer).toEqual(CLAUDE);
    expect(result.telemetry).toMatchObject({
      unavailableAttempts: 1,
      fallbackDepth: 1,
      fallbackUsed: true,
    });
  });

  it("never reviewer-shops after a blocking verdict", () => {
    const result = evaluateReviewerFailover(HEAD, [attempt(CODEX, "blocked")], policy);
    expect(result.state).toBe("blocked");
    expect(result.nextReviewer).toBeNull();
    expect(result.blockers.join(" ")).toContain("reviewer shopping is forbidden");
  });

  it("never fails over configuration or authentication errors", () => {
    for (const reasonCode of ["configuration", "authentication"] as const) {
      const result = evaluateReviewerFailover(HEAD, [
        attempt(CODEX, "unavailable", { reasonCode }),
      ], policy);
      expect(result.state).toBe("blocked");
      expect(result.nextReviewer).toBeNull();
      expect(result.blockers.join(" ")).toContain("not eligible for automatic failover");
    }
  });

  it("rejects stale-head receipts before selecting a fallback", () => {
    const result = evaluateReviewerFailover(HEAD, [
      attempt(CODEX, "unavailable", {
        reasonCode: "quota",
        headSha: "c".repeat(40),
      }),
    ], policy);
    expect(result.state).toBe("blocked");
    expect(result.blockers.join(" ")).toContain("exact current head");
  });

  it("requires a sha256 review hash for a clear result", () => {
    const result = evaluateReviewerFailover(HEAD, [
      attempt(CODEX, "clear", { reviewHash: "not-a-hash" }),
    ], policy);
    expect(result.state).toBe("blocked");
    expect(result.blockers.join(" ")).toContain("sha256 review receipt hash");
  });

  it("supports a 2-of-N quorum without changing reviewer order", () => {
    const quorumPolicy: ReviewerFailoverPolicy = {
      ...policy,
      requiredClearReviews: 2,
    };
    const first = evaluateReviewerFailover(HEAD, [attempt(CODEX, "clear")], quorumPolicy);
    expect(first.state).toBe("awaiting_review");
    expect(first.nextReviewer).toEqual(CLAUDE);

    const complete = evaluateReviewerFailover(HEAD, [
      attempt(CODEX, "clear"),
      attempt(CLAUDE, "clear", { reviewHash: "d".repeat(64) }),
    ], quorumPolicy);
    expect(complete.state).toBe("satisfied");
    expect(complete.clearReviewerIds).toEqual(["codex-reviewer", "claude-reviewer"]);
  });

  it("exhausts safely when all allowed reviewers are unavailable", () => {
    const result = evaluateReviewerFailover(HEAD, [
      attempt(CODEX, "unavailable", { reasonCode: "quota" }),
      attempt(CLAUDE, "unavailable", { reasonCode: "provider_outage" }),
      attempt(CHATGPT, "unavailable", { reasonCode: "rate_limit" }),
    ], policy);
    expect(result.state).toBe("exhausted");
    expect(result.nextReviewer).toBeNull();
    expect(result.telemetry.unavailableAttempts).toBe(3);
  });

  it("executes fallback automatically for quota exhaustion and stops on first clear review", async () => {
    const codexReview = vi.fn().mockResolvedValue({ state: "unavailable", reasonCode: "quota" });
    const claudeReview = vi.fn().mockResolvedValue({ state: "clear", reviewHash: HASH });
    const chatgptReview = vi.fn();

    const result = await runReviewerFailover(
      { repository: "jussray/founder-control-room", pullRequestNumber: 382, headSha: HEAD },
      [
        { candidate: CODEX, review: codexReview },
        { candidate: CLAUDE, review: claudeReview },
        { candidate: CHATGPT, review: chatgptReview },
      ],
      policy,
    );

    expect(codexReview).toHaveBeenCalledTimes(1);
    expect(claudeReview).toHaveBeenCalledTimes(1);
    expect(chatgptReview).not.toHaveBeenCalled();
    expect(result.decision.state).toBe("satisfied");
    expect(result.decision.telemetry.fallbackUsed).toBe(true);
    expect(result.attempts.map((item) => item.state)).toEqual(["unavailable", "clear"]);
  });

  it("stops execution immediately when a reviewer returns unresolved findings", async () => {
    const codexReview = vi.fn().mockResolvedValue({ state: "needs_review", reviewHash: HASH });
    const claudeReview = vi.fn();

    const result = await runReviewerFailover(
      { repository: "jussray/founder-control-room", pullRequestNumber: 382, headSha: HEAD },
      [
        { candidate: CODEX, review: codexReview },
        { candidate: CLAUDE, review: claudeReview },
      ],
      policy,
    );

    expect(result.decision.state).toBe("blocked");
    expect(claudeReview).not.toHaveBeenCalled();
  });
});
