import { describe, expect, it } from "vitest";
import type {
  RepositoryProvider,
  ReviewSignal,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
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
const TRUSTED_SEMANTIC = "semantic-reviewer-1";

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

function receipt(
  id: string,
  kind: "semantic" | "deterministic",
  severity?: "P1" | "P2",
): IndependentReviewReceipt {
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
    reviewer: {
      id,
      kind,
      provider: kind === "semantic" ? "provider-neutral" : "python",
      runtime: "test-runtime",
    },
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

interface ProviderOptions {
  omitReviewCapability?: boolean;
  mutateVerification?: (signal: VerificationSignal) => VerificationSignal;
  mutateReview?: (signal: ReviewSignal) => ReviewSignal;
}

function providerFor(
  reviews: IndependentReviewReceipt[],
  options: ProviderOptions = {},
): RepositoryProvider {
  const verificationSignals = reviews
    .filter((review) => review.reviewer.kind === "deterministic")
    .map((review, index) => {
      const signal: VerificationSignal = {
        id: `check-${index + 1}`,
        name: expectedReviewSignalName(review),
        status: "passed",
        commitSha: HEAD,
        provider: "github",
      };
      return options.mutateVerification ? options.mutateVerification(signal) : signal;
    });

  const reviewSignals = reviews
    .filter((review) => review.reviewer.kind === "semantic")
    .map((review, index) => {
      const signal: ReviewSignal = {
        id: `review-${index + 1}`,
        reviewerId: review.reviewer.id,
        state: review.verdict === "clear" ? "approved" : "changes_requested",
        commitSha: HEAD,
        provider: "github",
        receiptHash: review.reviewHash,
      };
      return options.mutateReview ? options.mutateReview(signal) : signal;
    });

  return {
    name: "github",
    getRef: async () => ({ name: HEAD, commitSha: HEAD }),
    listVerificationSignals: async () => verificationSignals,
    ...(!options.omitReviewCapability
      ? { listReviewSignals: async () => reviewSignals }
      : {}),
  } as unknown as RepositoryProvider;
}

const policy = {
  requiredSemanticReviews: 1,
  requireDeterministicReview: true,
  blockOnP2: true as const,
  trustedSemanticReviewerIds: [TRUSTED_SEMANTIC],
};

describe("independent review receipt gate", () => {
  it("accepts provider-backed semantic approval plus Python check without granting merge authority", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
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

  it("does not let a semantic-looking check substitute for a provider PR review", async () => {
    const semantic = receipt(TRUSTED_SEMANTIC, "semantic");
    const python = receipt("python-static-review-v1", "deterministic");
    const reviews = [semantic, python];
    const provider = providerFor(reviews, { omitReviewCapability: true });
    const result = await evaluateIndependentReviewGate(provider, context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/cannot supply provider-backed semantic review witnesses/);
  });

  it("requires the semantic provider review to bind the exact receipt hash", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const provider = providerFor(reviews, {
      mutateReview: (signal) => ({ ...signal, receiptHash: "f".repeat(64) }),
    });
    const result = await evaluateIndependentReviewGate(provider, context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/Missing exact-head provider PR-review witness/);
  });

  it("requires semantic approval to be attached to the exact head", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const provider = providerFor(reviews, {
      mutateReview: (signal) => ({ ...signal, commitSha: "c".repeat(40) }),
    });
    const result = await evaluateIndependentReviewGate(provider, context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/Missing exact-head provider PR-review witness/);
  });

  it("requires deterministic Python evidence at the exact head", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const provider = providerFor(reviews, {
      mutateVerification: (signal) => ({ ...signal, commitSha: "c".repeat(40) }),
    });
    const result = await evaluateIndependentReviewGate(provider, context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/Missing passed exact-head deterministic witness/);
  });

  it("blocks any witnessed P1 finding", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic", "P1"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/blocking review verdict/);
  });

  it("keeps P2 merge-blocking", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic", "P2"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/unresolved P2/);
  });

  it("refuses semantic reviewers not present in the trusted policy set", async () => {
    const reviews = [
      receipt("semantic-reviewer-untrusted", "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/not trusted by policy/);
  });

  it("fails closed when a receipt is altered after hashing", async () => {
    const clean = receipt(TRUSTED_SEMANTIC, "semantic");
    const tampered = { ...clean, summary: "Tampered after review." };
    const reviews = [tampered, receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/hash does not match/);
  });

  it("refuses self-review before consulting provider witnesses", async () => {
    const self = receipt(context.authorIdentity, "semantic");
    const reviews = [self, receipt("python-static-review-v1", "deterministic")];
    const selfPolicy = { ...policy, trustedSemanticReviewerIds: [context.authorIdentity] };
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, selfPolicy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/Patch author cannot satisfy independent review/);
  });

  it("fails closed instead of throwing on malformed deserialized receipt fields", async () => {
    const malformed = {
      ...receipt(TRUSTED_SEMANTIC, "semantic"),
      repository: null,
      findings: "not-an-array",
    } as unknown as IndependentReviewReceipt;
    const reviews = [malformed, receipt("python-static-review-v1", "deterministic")];
    await expect(evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy)).resolves.toMatchObject({
      reviewGateSatisfied: false,
    });
  });
});
