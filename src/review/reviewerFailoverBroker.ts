export type ReviewerAttemptState =
  | "clear"
  | "blocked"
  | "needs_review"
  | "unavailable"
  | "error";

export type ReviewerAvailabilityReason =
  | "quota"
  | "rate_limit"
  | "timeout"
  | "provider_outage"
  | "authentication"
  | "configuration"
  | "unknown";

export interface ReviewerCandidate {
  reviewerId: string;
  provider: string;
  runtime: string;
}

export interface ReviewerAttempt {
  reviewerId: string;
  provider: string;
  runtime: string;
  headSha: string;
  state: ReviewerAttemptState;
  reasonCode?: ReviewerAvailabilityReason;
  reviewHash?: string;
}

export interface ReviewerFailoverPolicy {
  orderedReviewers: ReviewerCandidate[];
  requiredClearReviews: number;
  maxFallbacks: number;
}

export type ReviewerBrokerState =
  | "awaiting_review"
  | "satisfied"
  | "blocked"
  | "exhausted";

export interface ReviewerFailoverTelemetry {
  totalAttempts: number;
  clearAttempts: number;
  unavailableAttempts: number;
  blockingAttempts: number;
  fallbackDepth: number;
  fallbackUsed: boolean;
}

export interface ReviewerFailoverDecision {
  state: ReviewerBrokerState;
  nextReviewer: ReviewerCandidate | null;
  clearReviewerIds: string[];
  attemptedReviewerIds: string[];
  blockers: string[];
  telemetry: ReviewerFailoverTelemetry;
}

export interface ReviewerExecutionContext {
  repository: string;
  pullRequestNumber: number;
  headSha: string;
}

export type ReviewerExecutionOutcome =
  | { state: "clear"; reviewHash: string }
  | { state: "blocked"; reviewHash?: string }
  | { state: "needs_review"; reviewHash?: string }
  | { state: "unavailable"; reasonCode: ReviewerAvailabilityReason }
  | { state: "error"; reasonCode: ReviewerAvailabilityReason };

export interface SemanticReviewerExecutor {
  candidate: ReviewerCandidate;
  review(context: ReviewerExecutionContext): Promise<ReviewerExecutionOutcome>;
}

export interface ReviewerFailoverRunResult {
  decision: ReviewerFailoverDecision;
  attempts: ReviewerAttempt[];
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const ELIGIBLE_FAILOVER_REASONS = new Set<ReviewerAvailabilityReason>([
  "quota",
  "rate_limit",
  "timeout",
  "provider_outage",
]);

const normalized = (value: string): string => value.trim().toLowerCase();

function candidateKey(candidate: ReviewerCandidate): string {
  return normalized(candidate.reviewerId);
}

function attemptKey(attempt: ReviewerAttempt): string {
  return normalized(attempt.reviewerId);
}

function sameCandidate(candidate: ReviewerCandidate, attempt: ReviewerAttempt): boolean {
  return candidateKey(candidate) === attemptKey(attempt)
    && normalized(candidate.provider) === normalized(attempt.provider)
    && normalized(candidate.runtime) === normalized(attempt.runtime);
}

function telemetryFor(attempts: ReviewerAttempt[]): ReviewerFailoverTelemetry {
  const unavailableAttempts = attempts.filter((attempt) => attempt.state === "unavailable").length;
  return {
    totalAttempts: attempts.length,
    clearAttempts: attempts.filter((attempt) => attempt.state === "clear").length,
    unavailableAttempts,
    blockingAttempts: attempts.filter((attempt) =>
      attempt.state === "blocked"
      || attempt.state === "needs_review"
      || attempt.state === "error"
    ).length,
    fallbackDepth: unavailableAttempts,
    fallbackUsed: unavailableAttempts > 0,
  };
}

function blockedDecision(
  attempts: ReviewerAttempt[],
  blockers: string[],
): ReviewerFailoverDecision {
  return {
    state: "blocked",
    nextReviewer: null,
    clearReviewerIds: attempts
      .filter((attempt) => attempt.state === "clear")
      .map((attempt) => attempt.reviewerId),
    attemptedReviewerIds: attempts.map((attempt) => attempt.reviewerId),
    blockers,
    telemetry: telemetryFor(attempts),
  };
}

export function evaluateReviewerFailover(
  headSha: string,
  attempts: ReviewerAttempt[],
  policy: ReviewerFailoverPolicy,
): ReviewerFailoverDecision {
  const blockers: string[] = [];

  if (!FULL_SHA.test(headSha)) blockers.push("Reviewer failover requires one exact 40-character head SHA");
  if (!Array.isArray(policy?.orderedReviewers) || policy.orderedReviewers.length < 1 || policy.orderedReviewers.length > 8) {
    blockers.push("Reviewer failover policy requires 1-8 ordered reviewers");
  }
  if (!Number.isInteger(policy?.requiredClearReviews) || policy.requiredClearReviews < 1 || policy.requiredClearReviews > 4) {
    blockers.push("Reviewer failover policy requires 1-4 clear semantic reviews");
  }
  if (!Number.isInteger(policy?.maxFallbacks) || policy.maxFallbacks < 0 || policy.maxFallbacks > 7) {
    blockers.push("Reviewer failover policy requires maxFallbacks between 0 and 7");
  }

  const candidateIds = (policy?.orderedReviewers ?? []).map(candidateKey).filter(Boolean);
  if (candidateIds.some((id) => !id)) blockers.push("Reviewer identities must be non-empty");
  if (new Set(candidateIds).size !== candidateIds.length) blockers.push("Reviewer identities must be unique");
  if (policy?.requiredClearReviews > candidateIds.length) blockers.push("Policy has fewer reviewers than required clear reviews");

  const seenAttempts = new Set<string>();
  for (const attempt of Array.isArray(attempts) ? attempts : []) {
    const key = attemptKey(attempt);
    if (!key || seenAttempts.has(key)) blockers.push(`Reviewer attempts must be unique: ${attempt.reviewerId || "unknown"}`);
    if (key) seenAttempts.add(key);
    if (!FULL_SHA.test(attempt.headSha) || normalized(attempt.headSha) !== normalized(headSha)) {
      blockers.push(`${attempt.reviewerId || "unknown reviewer"} attempt is not bound to the exact current head`);
    }

    const candidate = (policy?.orderedReviewers ?? []).find((item) => candidateKey(item) === key);
    if (!candidate || !sameCandidate(candidate, attempt)) {
      blockers.push(`${attempt.reviewerId || "unknown reviewer"} is not the configured reviewer identity/provider/runtime`);
    }

    if (attempt.state === "clear" && (!attempt.reviewHash || !SHA256.test(attempt.reviewHash))) {
      blockers.push(`${attempt.reviewerId} clear attempt requires a sha256 review receipt hash`);
    }
    if (attempt.state === "unavailable") {
      if (!attempt.reasonCode || !ELIGIBLE_FAILOVER_REASONS.has(attempt.reasonCode)) {
        blockers.push(`${attempt.reviewerId} unavailability is not eligible for automatic failover`);
      }
    }
    if (attempt.state === "error") {
      blockers.push(`${attempt.reviewerId} review execution errored; automatic failover is forbidden`);
    }
    if (attempt.state === "blocked") {
      blockers.push(`${attempt.reviewerId} reported a blocking review verdict; reviewer shopping is forbidden`);
    }
    if (attempt.state === "needs_review") {
      blockers.push(`${attempt.reviewerId} reported unresolved review findings; reviewer shopping is forbidden`);
    }
  }

  if (blockers.length > 0) return blockedDecision(attempts, blockers);

  const clearReviewerIds = attempts
    .filter((attempt) => attempt.state === "clear")
    .map((attempt) => attempt.reviewerId);
  const unavailableCount = attempts.filter((attempt) => attempt.state === "unavailable").length;

  if (clearReviewerIds.length >= policy.requiredClearReviews) {
    return {
      state: "satisfied",
      nextReviewer: null,
      clearReviewerIds,
      attemptedReviewerIds: attempts.map((attempt) => attempt.reviewerId),
      blockers: [],
      telemetry: telemetryFor(attempts),
    };
  }

  if (unavailableCount > policy.maxFallbacks) {
    return {
      state: "exhausted",
      nextReviewer: null,
      clearReviewerIds,
      attemptedReviewerIds: attempts.map((attempt) => attempt.reviewerId),
      blockers: [`Reviewer fallback budget exhausted: ${unavailableCount}/${policy.maxFallbacks}`],
      telemetry: telemetryFor(attempts),
    };
  }

  const attemptedIds = new Set(attempts.map(attemptKey));
  const nextReviewer = policy.orderedReviewers.find((candidate) => !attemptedIds.has(candidateKey(candidate))) ?? null;

  if (!nextReviewer) {
    return {
      state: "exhausted",
      nextReviewer: null,
      clearReviewerIds,
      attemptedReviewerIds: attempts.map((attempt) => attempt.reviewerId),
      blockers: [
        `No trusted reviewer remains: ${clearReviewerIds.length}/${policy.requiredClearReviews} clear reviews satisfied`,
      ],
      telemetry: telemetryFor(attempts),
    };
  }

  return {
    state: "awaiting_review",
    nextReviewer,
    clearReviewerIds,
    attemptedReviewerIds: attempts.map((attempt) => attempt.reviewerId),
    blockers: [],
    telemetry: telemetryFor(attempts),
  };
}

export async function runReviewerFailover(
  context: ReviewerExecutionContext,
  executors: SemanticReviewerExecutor[],
  policy: ReviewerFailoverPolicy,
): Promise<ReviewerFailoverRunResult> {
  const attempts: ReviewerAttempt[] = [];
  const executorsById = new Map(
    executors.map((executor) => [candidateKey(executor.candidate), executor]),
  );

  while (true) {
    const decision = evaluateReviewerFailover(context.headSha, attempts, policy);
    if (decision.state !== "awaiting_review" || !decision.nextReviewer) {
      return { decision, attempts };
    }

    const executor = executorsById.get(candidateKey(decision.nextReviewer));
    if (!executor || !sameCandidate(decision.nextReviewer, {
      ...decision.nextReviewer,
      headSha: context.headSha,
      state: "unavailable",
    })) {
      attempts.push({
        ...decision.nextReviewer,
        headSha: context.headSha,
        state: "error",
        reasonCode: "configuration",
      });
      continue;
    }

    let outcome: ReviewerExecutionOutcome;
    try {
      outcome = await executor.review(context);
    } catch {
      outcome = { state: "error", reasonCode: "unknown" };
    }

    attempts.push({
      ...decision.nextReviewer,
      headSha: context.headSha,
      ...outcome,
    });
  }
}
