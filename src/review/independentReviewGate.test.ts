import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
const FCR_TRUSTED_REVIEWERS_ENV = "FCR_TRUSTED_SEMANTIC_REVIEWER_IDS";
let previousTrustedReviewers: string | undefined;

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
  additionalReviewSignals?: ReviewSignal[];
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
        id: String(index + 100),
        reviewerId: review.reviewer.id,
        state: review.verdict === "clear" ? "approved" : "changes_requested",
        commitSha: HEAD,
        provider: "github",
        receiptHash: review.reviewHash,
        submittedAt: `2026-08-15T02:30:0${index}Z`,
      };
      return options.mutateReview ? options.mutateReview(signal) : signal;
    });

  reviewSignals.push(...(options.additionalReviewSignals ?? []));

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
  beforeEach(() => {
    previousTrustedReviewers = process.env[FCR_TRUSTED_REVIEWERS_ENV];
    process.env[FCR_TRUSTED_REVIEWERS_ENV] = TRUSTED_SEMANTIC;
  });

  afterEach(() => {
    if (previousTrustedReviewers === undefined) delete process.env[FCR_TRUSTED_REVIEWERS_ENV];
    else process.env[FCR_TRUSTED_REVIEWERS_ENV] = previousTrustedReviewers;
  });

  it("accepts current provider-backed semantic approval plus Python check without granting merge authority", async () => {
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

  it("fails closed when FCR server-owned reviewer configuration is missing", async () => {
    delete process.env[FCR_TRUSTED_REVIEWERS_ENV];
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/server-owned FCR_TRUSTED_SEMANTIC_REVIEWER_IDS/);
  });

  it("rejects a caller-selected FCR reviewer policy that differs from server authority", async () => {
    const callerPolicy = { ...policy, trustedSemanticReviewerIds: ["caller-selected-reviewer"] };
    const reviews = [
      receipt("caller-selected-reviewer", "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, callerPolicy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/must match the server-owned semantic reviewer policy/);
  });

  it("rejects a caller-selected FCR semantic quorum that differs from server authority", async () => {
    process.env[FCR_TRUSTED_REVIEWERS_ENV] = `${TRUSTED_SEMANTIC},semantic-reviewer-2`;
    const callerPolicy = {
      ...policy,
      requiredSemanticReviews: 2,
      trustedSemanticReviewerIds: [TRUSTED_SEMANTIC, "semantic-reviewer-2"],
    };
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("semantic-reviewer-2", "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, callerPolicy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/must match the server-owned semantic reviewer policy/);
  });

  it("does not let Python-only review satisfy the semantic requirement", async () => {
    const reviews = [receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/Semantic review requirement/);
  });

  it("does not let a semantic-looking check substitute for a provider PR review", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(
      providerFor(reviews, { omitReviewCapability: true }),
      context,
      reviews,
      policy,
    );
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/cannot supply provider-backed semantic review witnesses/);
  });

  it("requires the semantic provider review to bind the exact receipt hash", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews, {
      mutateReview: (signal) => ({ ...signal, receiptHash: "f".repeat(64) }),
    }), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/provider PR-review witness/);
  });

  it("requires semantic approval to be attached to the exact head", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews, {
      mutateReview: (signal) => ({ ...signal, commitSha: "c".repeat(40) }),
    }), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/provider PR-review witness/);
  });

  it("invalidates an older approval when the same reviewer later requests changes", async () => {
    const semantic = receipt(TRUSTED_SEMANTIC, "semantic");
    const reviews = [semantic, receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews, {
      additionalReviewSignals: [{
        id: "999",
        reviewerId: TRUSTED_SEMANTIC,
        state: "changes_requested",
        commitSha: HEAD,
        provider: "github",
        receiptHash: semantic.reviewHash,
        submittedAt: "2026-08-15T02:31:00Z",
      }],
    }), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/current exact-head provider PR-review witness/);
  });

  it("fails closed when multiple semantic review events cannot be ordered", async () => {
    const semantic = receipt(TRUSTED_SEMANTIC, "semantic");
    const reviews = [semantic, receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews, {
      mutateReview: (signal) => ({ ...signal, submittedAt: undefined }),
      additionalReviewSignals: [{
        id: "999",
        reviewerId: TRUSTED_SEMANTIC,
        state: "approved",
        commitSha: HEAD,
        provider: "github",
        receiptHash: semantic.reviewHash,
      }],
    }), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/current exact-head provider PR-review witness/);
  });

  it("requires deterministic Python evidence at the exact head", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews, {
      mutateVerification: (signal) => ({ ...signal, commitSha: "c".repeat(40) }),
    }), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/Missing passed exact-head deterministic witness/);
  });

  it("requires witness signals to come from the repository provider being queried", async () => {
    const reviews = [
      receipt(TRUSTED_SEMANTIC, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const result = await evaluateIndependentReviewGate(providerFor(reviews, {
      mutateReview: (signal) => ({ ...signal, provider: "other-provider" }),
      mutateVerification: (signal) => ({ ...signal, provider: "other-provider" }),
    }), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/witness/);
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

  it("refuses GitHub App bot identities even when founder policy lists them as trusted", async () => {
    const botReviewer = "semantic-reviewer[bot]";
    const reviews = [
      receipt(botReviewer, "semantic"),
      receipt("python-static-review-v1", "deterministic"),
    ];
    const botPolicy = { ...policy, trustedSemanticReviewerIds: [botReviewer] };
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, botPolicy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/bot cannot satisfy|cannot include GitHub App bot identities/i);
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

  it("rejects malformed finding path/recommendation fields even with a recomputed receipt hash", async () => {
    const clean = receipt(TRUSTED_SEMANTIC, "semantic", "P1");
    const malformedDraft = {
      ...clean,
      findings: [{ ...clean.findings[0], path: null, recommendation: 123 }],
      reviewHash: "",
    } as unknown as IndependentReviewReceipt;
    const malformed = { ...malformedDraft, reviewHash: independentReviewHash(malformedDraft) };
    const reviews = [malformed, receipt("python-static-review-v1", "deterministic")];
    const result = await evaluateIndependentReviewGate(providerFor(reviews), context, reviews, policy);
    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/path must be a string/);
    expect(result.blockers.join(" ")).toMatch(/recommendation must be a string/);
  });
});