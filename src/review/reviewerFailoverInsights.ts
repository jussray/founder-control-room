import type {
  ReviewerAttempt,
  ReviewerFailoverPolicy,
  ReviewerFailoverRunResult,
} from "./reviewerFailoverBroker.js";

export type ReviewerGateTone = "ready" | "degraded" | "blocked" | "exhausted";

export interface ReviewerFailoverControlRoomView {
  exactHeadSha: string;
  state: ReviewerFailoverRunResult["decision"]["state"];
  tone: ReviewerGateTone;
  primaryReviewerId: string;
  activeReviewerId: string | null;
  finalReviewerId: string | null;
  quorum: {
    clear: number;
    required: number;
    remaining: number;
  };
  fallback: {
    used: boolean;
    depth: number;
    lastAvailabilityReason: ReviewerAttempt["reasonCode"] | null;
  };
  mergeAuthority: "review_gate_satisfied" | "hold";
  message: string;
}

export interface ReviewerAvailabilityKpi {
  reviewerId: string;
  attempts: number;
  unavailableAttempts: number;
  availabilityRate: number | null;
}

export interface ReviewerFailoverKpis {
  runs: number;
  runsWithAttempts: number;
  satisfiedRuns: number;
  fallbackRuns: number;
  exhaustedRuns: number;
  reviewGateSatisfactionRate: number | null;
  fallbackActivationRate: number | null;
  fallbackRecoveryRate: number | null;
  exhaustionRate: number | null;
  primaryUnavailabilityRate: number | null;
  meanFallbackDepth: number | null;
  reviewerAvailability: ReviewerAvailabilityKpi[];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function lastUnavailable(attempts: ReviewerAttempt[]): ReviewerAttempt | undefined {
  return [...attempts].reverse().find((attempt) => attempt.state === "unavailable");
}

function finalClearReviewerId(attempts: ReviewerAttempt[]): string | null {
  return [...attempts].reverse().find((attempt) => attempt.state === "clear")?.reviewerId ?? null;
}

export function buildReviewerFailoverControlRoomView(
  exactHeadSha: string,
  policy: ReviewerFailoverPolicy,
  run: ReviewerFailoverRunResult,
): ReviewerFailoverControlRoomView {
  const clear = run.decision.clearReviewerIds.length;
  const required = policy.requiredClearReviews;
  const remaining = Math.max(0, required - clear);
  const fallbackUsed = run.decision.telemetry.fallbackUsed;
  const lastUnavailableAttempt = lastUnavailable(run.attempts);
  const primaryReviewerId = policy.orderedReviewers[0]?.reviewerId ?? "unconfigured";
  const activeReviewerId = run.decision.nextReviewer?.reviewerId ?? null;
  const finalReviewerId = finalClearReviewerId(run.attempts);

  let tone: ReviewerGateTone;
  if (run.decision.state === "satisfied") tone = fallbackUsed ? "degraded" : "ready";
  else if (run.decision.state === "blocked") tone = "blocked";
  else if (run.decision.state === "exhausted") tone = "exhausted";
  else tone = fallbackUsed ? "degraded" : "ready";

  let message: string;
  if (run.decision.state === "satisfied") {
    message = fallbackUsed
      ? `Review gate satisfied by fallback after ${run.decision.telemetry.fallbackDepth} unavailable reviewer(s).`
      : "Review gate satisfied by the primary review path.";
  } else if (run.decision.state === "blocked") {
    message = "Review gate blocked by a substantive verdict or non-failover-safe execution error.";
  } else if (run.decision.state === "exhausted") {
    message = `Reviewer pool exhausted with ${clear}/${required} clear review(s).`;
  } else {
    message = activeReviewerId
      ? `Review in progress with ${activeReviewerId}; ${clear}/${required} clear review(s).`
      : `Review is awaiting a trusted reviewer; ${clear}/${required} clear review(s).`;
  }

  return {
    exactHeadSha,
    state: run.decision.state,
    tone,
    primaryReviewerId,
    activeReviewerId,
    finalReviewerId,
    quorum: { clear, required, remaining },
    fallback: {
      used: fallbackUsed,
      depth: run.decision.telemetry.fallbackDepth,
      lastAvailabilityReason: lastUnavailableAttempt?.reasonCode ?? null,
    },
    mergeAuthority: run.decision.state === "satisfied" ? "review_gate_satisfied" : "hold",
    message,
  };
}

export function aggregateReviewerFailoverKpis(
  runs: ReviewerFailoverRunResult[],
  policy: ReviewerFailoverPolicy,
): ReviewerFailoverKpis {
  const totalRuns = runs.length;
  const runsWithAttempts = runs.filter((run) => run.attempts.length > 0);
  const satisfiedRuns = runs.filter((run) => run.decision.state === "satisfied").length;
  const fallbackRuns = runs.filter((run) => run.decision.telemetry.fallbackUsed).length;
  const exhaustedRuns = runs.filter((run) => run.decision.state === "exhausted").length;
  const primaryReviewerId = policy.orderedReviewers[0]?.reviewerId.toLowerCase() ?? "";
  const primaryAttemptRuns = runsWithAttempts.filter((run) =>
    run.attempts.some((attempt) => attempt.reviewerId.toLowerCase() === primaryReviewerId)
  );
  const primaryUnavailableRuns = primaryAttemptRuns.filter((run) =>
    run.attempts.some((attempt) =>
      attempt.reviewerId.toLowerCase() === primaryReviewerId && attempt.state === "unavailable"
    )
  ).length;
  const fallbackRecoveredRuns = runs.filter((run) =>
    run.decision.telemetry.fallbackUsed && run.decision.state === "satisfied"
  ).length;
  const fallbackDepthTotal = runs.reduce(
    (sum, run) => sum + run.decision.telemetry.fallbackDepth,
    0,
  );

  const reviewerMap = new Map<string, { reviewerId: string; attempts: number; unavailable: number }>();
  for (const run of runs) {
    for (const attempt of run.attempts) {
      const key = attempt.reviewerId.toLowerCase();
      const current = reviewerMap.get(key) ?? {
        reviewerId: attempt.reviewerId,
        attempts: 0,
        unavailable: 0,
      };
      current.attempts += 1;
      if (attempt.state === "unavailable") current.unavailable += 1;
      reviewerMap.set(key, current);
    }
  }

  const reviewerAvailability = [...reviewerMap.values()]
    .map((item) => ({
      reviewerId: item.reviewerId,
      attempts: item.attempts,
      unavailableAttempts: item.unavailable,
      availabilityRate: ratio(item.attempts - item.unavailable, item.attempts),
    }))
    .sort((a, b) => a.reviewerId.localeCompare(b.reviewerId));

  return {
    runs: totalRuns,
    runsWithAttempts: runsWithAttempts.length,
    satisfiedRuns,
    fallbackRuns,
    exhaustedRuns,
    reviewGateSatisfactionRate: ratio(satisfiedRuns, totalRuns),
    fallbackActivationRate: ratio(fallbackRuns, totalRuns),
    fallbackRecoveryRate: ratio(fallbackRecoveredRuns, fallbackRuns),
    exhaustionRate: ratio(exhaustedRuns, totalRuns),
    primaryUnavailabilityRate: ratio(primaryUnavailableRuns, primaryAttemptRuns.length),
    meanFallbackDepth: totalRuns > 0 ? fallbackDepthTotal / totalRuns : null,
    reviewerAvailability,
  };
}
