import { describe, expect, it } from "vitest";
import type { RepositoryProvider, VerificationSignal } from "../providers/RepositoryProvider.js";
import {
  INDEPENDENT_REVIEW_CONTRACT,
  evaluateIndependentReviewGate,
  expectedReviewSignalName,
  independentReviewHash,
  type IndependentReviewContext,
  type IndependentReviewReceipt,
} from "./independentReviewGate.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const DIFF = "1".repeat(64);
const POLICY = "2".repeat(64);

const context: IndependentReviewContext = {
  projectId: "founder-control-room",
  repository: "jussray/founder-control-room",
  pullRequestNumber: 361,
  baseSha: BASE,
  headSha: HEAD,
  diffHash: DIFF,
  policyHash: POLICY,
  authorIdentity: "builder-agent",
};

function receipt(id: string, kind: "semantic" | "deterministic", severity?: "P1" | "P2"): IndependentReviewReceipt {
  const findings = severity ? [{
    id: `${id}-${severity}`,
    severity,
    title: "Review finding",
    path: "src/example.ts",
    line: 10,
    evidence: "The exact-head diff contains a review finding.",
    recommendation: "Repair and re-review the exact head.",
  }] : [];
  const verdict = severity === "P1" ? "blocked" : severity === "P2" ? "needs_review" : "clear";
  const draft = {
    contract: INDEPENDENT_REVIEW_CONTRACT,
    repository: context.repository,
    pullRequestNumber: context.pullRequestNumber,
    baseSha: context.baseSha,
    headSha: context.headSha,
    diffHash: context.diffHash,
    policyHash: context.policyHash,
    reviewer: { id, kind, provider: kind === "semantic" ? "provider-neutral" : "python", runtime: "test-runtime" },
    authorIdentity: context.authorIdentity,
    findings,
    verdict,
    summary: `${id} reviewed the exact head.`,
    proposalOnly: true as const,
    mergeAuthorized: false as const,
    executionAuthorized: false as const,
    reviewHash: "",
  } satisfies IndependentReviewReceipt;
  return { ...draft, reviewHash: independentReviewHash(draft) };
}

function providerFor(reviews: IndependentReviewReceipt[], mutateSignal?: (signal: VerificationSignal) => VerificationSignal): RepositoryProvider {
  const signals = reviews.map((review, index) => {
    const signal: VerificationSignal = {
      id: String(index + 1),
      name: expectedReviewSignalName(review),
      status: "passed",
      commitSha: HEAD,
      provider: "github",
    };
    return mutateSignal ? mutateSignal(signal) : signal;
  });
  return {
    name: "github",
    getRef: async () => ({ name: HEAD, commitSha: HEAD }),
    listVerificationSignals: async () => signals,
  } as unknown as RepositoryProvider;
}

const policy = {
  requiredSemanticReviews: 1,
  requireDeterministicReview: true,
  blockOnP2: true,
};

describe("independent review receipt gate", () => {
  it("accepts witnessed semantic + Python review while never authorizing merge/execution", async () => {
    const reviews = [receipt("semantic-reviewer-1", "semantic"), receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(true);
    expect(result.semanticClearCount).toBe(1);
    expect(result.deterministicClearCount).toBe(1);
    expect(result.mergeAuthorized).toBe(false);
    expect(result.executionAuthorized).toBe(false);
  });

  it("does not let Python-only review satisfy the semantic requirement", async () => {
    const reviews = [receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/Semantic review requirement/);
  });

  it("requires an exact-head repository-provider witness", async () => {
    const reviews = [receipt("semantic-reviewer-1", "semantic"), receipt("python-static-review-v1", "deterministic")];
    const provider = providerFor(reviews, (signal) => ({ ...signal, commitSha: "c".repeat(40) }));
    const result = await evaluateIndependentReviewGate(provider, context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.some((blocker) => blocker.includes("Missing passed exact-head"))).toBe(true);
  });

  it("blocks any witnessed P1 finding", async () => {
    const reviews = [receipt("semantic-reviewer-1", "semantic", "P1"), receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/blocking review verdict/);
  });

  it("fails closed when a receipt is altered after hashing", async () => {
    const clean = receipt("semantic-reviewer-1", "semantic");
    const tampered = { ...clean, summary: "Tampered after review." };
    const reviews = [tampered, receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/hash does not match/);
  });

  it("refuses self-review even when a matching signal exists", async () => {
    const self = receipt(context.authorIdentity, "semantic");
    const reviews = [self, receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/Patch author cannot satisfy independent review/);
  });
});
