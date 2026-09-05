import { describe, expect, it } from "vitest";
import type { RepositoryProvider, VerificationSignal } from "../providers/RepositoryProvider.js";
import {
  FCR_FOUNDER_FINAL_REVIEW_POLICY,
  INDEPENDENT_REVIEW_CONTRACT,
  evaluateIndependentReviewGate,
  expectedReviewSignalName,
  independentReviewHash,
  independentReviewPolicyHash,
  type IndependentReviewContext,
  type IndependentReviewReceipt,
} from "./independentReviewGate.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const DIFF = "1".repeat(64);
const AUTHOR = "jussray";
const TRUSTED_APP_ID = "12345";

function deterministicReceipt(): IndependentReviewReceipt {
  const policyHash = independentReviewPolicyHash(FCR_FOUNDER_FINAL_REVIEW_POLICY);
  const draft = {
    contract: INDEPENDENT_REVIEW_CONTRACT,
    repository: "jussray/founder-control-room",
    pullRequestNumber: 600,
    baseSha: BASE,
    headSha: HEAD,
    diffHash: DIFF,
    policyHash,
    reviewer: {
      id: "deterministic-review-v1",
      kind: "deterministic" as const,
      provider: "github",
      runtime: "vitest",
    },
    authorIdentity: AUTHOR,
    findings: [],
    verdict: "clear" as const,
    summary: "Deterministic exact-head review is clear.",
    proposalOnly: true as const,
    mergeAuthorized: false as const,
    executionAuthorized: false as const,
    reviewHash: "",
  } satisfies IndependentReviewReceipt;
  return { ...draft, reviewHash: independentReviewHash(draft) };
}

function context(policyHash: string): IndependentReviewContext {
  return {
    projectId: "founder-control-room",
    repository: "jussray/founder-control-room",
    pullRequestNumber: 600,
    baseSha: BASE,
    headSha: HEAD,
    diffHash: DIFF,
    policyHash,
    authorIdentity: AUTHOR,
  };
}

function providerFor(
  review: IndependentReviewReceipt,
  signalStatus: VerificationSignal["status"] = "passed",
  issuerId: string | null = TRUSTED_APP_ID,
) {
  return {
    name: "github",
    getRef: async () => ({ name: HEAD, commitSha: HEAD }),
    listVerificationSignals: async () => [{
      id: "deterministic-review-check",
      name: expectedReviewSignalName(review),
      status: signalStatus,
      commitSha: HEAD,
      provider: "github",
      evidenceFingerprint: review.reviewHash,
      ...(issuerId === null ? {} : { issuer: { kind: "app" as const, id: issuerId, name: "fcr-review" } }),
    }],
  } as unknown as RepositoryProvider;
}

const trustedEnv = { GITHUB_APP_ID: TRUSTED_APP_ID };

describe("FCR founder-final review policy", () => {
  it("accepts exact-head deterministic review only from the server-owned GitHub App issuer", async () => {
    const review = deterministicReceipt();
    const result = await evaluateIndependentReviewGate(
      providerFor(review),
      context(review.policyHash),
      [review],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      trustedEnv,
    );

    expect(result.reviewGateSatisfied).toBe(true);
    expect(result.semanticClearCount).toBe(0);
    expect(result.deterministicClearCount).toBe(1);
    expect(result.mergeAuthorized).toBe(false);
    expect(result.executionAuthorized).toBe(false);
  });

  it("fails closed when server-owned trusted App identity is not configured", async () => {
    const review = deterministicReceipt();
    const result = await evaluateIndependentReviewGate(
      providerFor(review),
      context(review.policyHash),
      [review],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      {},
    );

    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/GITHUB_APP_ID|server-owned/i);
  });

  it("rejects a same-name exact-head green check from a different GitHub App issuer", async () => {
    const review = deterministicReceipt();
    const result = await evaluateIndependentReviewGate(
      providerFor(review, "passed", "99999"),
      context(review.policyHash),
      [review],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      trustedEnv,
    );

    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/trusted GitHub App issuer|deterministic witness/i);
  });

  it("rejects a deterministic check whose provider omits issuer identity", async () => {
    const review = deterministicReceipt();
    const result = await evaluateIndependentReviewGate(
      providerFor(review, "passed", null),
      context(review.policyHash),
      [review],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      trustedEnv,
    );

    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/trusted GitHub App issuer|deterministic witness/i);
  });

  it("still fails closed when the deterministic exact-head witness is missing", async () => {
    const review = deterministicReceipt();
    const result = await evaluateIndependentReviewGate(
      providerFor(review, "failed"),
      context(review.policyHash),
      [review],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      trustedEnv,
    );

    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/deterministic witness|Deterministic review requirement/i);
  });

  it("rejects caller attempts to weaken or redefine the server-owned founder-final policy", async () => {
    const review = deterministicReceipt();
    const weakened = {
      ...FCR_FOUNDER_FINAL_REVIEW_POLICY,
      requireDeterministicReview: false,
    };
    const result = await evaluateIndependentReviewGate(
      providerFor(review),
      context(review.policyHash),
      [review],
      weakened,
      trustedEnv,
    );

    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/server-owned deterministic-review policy/);
  });
});
