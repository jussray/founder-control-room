import { describe, expect, it, vi } from "vitest";
import type {
  PullRequestReviewContext,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
import {
  INDEPENDENT_REVIEW_CONTRACT,
  independentReviewHash,
  expectedReviewSignalName,
  type IndependentReviewReceipt,
} from "./independentReviewGate.js";
import {
  publishDeterministicReviewWitness,
  type VerificationSignalPublishingProvider,
} from "./deterministicReviewWitnessPublisher.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const APP_ID = "12345";

function receipt(overrides: Partial<IndependentReviewReceipt> = {}): IndependentReviewReceipt {
  const draft: IndependentReviewReceipt = {
    contract: INDEPENDENT_REVIEW_CONTRACT,
    repository: "jussray/founder-control-room",
    pullRequestNumber: 706,
    baseSha: BASE,
    headSha: HEAD,
    diffHash: "c".repeat(64),
    policyHash: "d".repeat(64),
    reviewer: {
      id: "fcr-deterministic-review-v1",
      kind: "deterministic",
      provider: "github",
      runtime: "fcr/deterministic-review-rules@v1",
    },
    authorIdentity: "jussray",
    findings: [],
    verdict: "clear",
    summary: "clear deterministic review",
    proposalOnly: true,
    mergeAuthorized: false,
    executionAuthorized: false,
    reviewHash: "",
    ...overrides,
  };
  draft.reviewHash = independentReviewHash(draft);
  return draft;
}

function context(overrides: Partial<PullRequestReviewContext> = {}): PullRequestReviewContext {
  return {
    number: 706,
    repository: "jussray/founder-control-room",
    headRepository: "jussray/founder-control-room",
    baseRef: "main",
    headRef: "fix/test-discovery",
    baseSha: BASE,
    headSha: HEAD,
    authorIdentity: "jussray",
    ...overrides,
  };
}

function provider({
  review = receipt(),
  reviewContext = context(),
  currentBase = BASE,
  currentHead = HEAD,
  issuerId = APP_ID,
}: {
  review?: IndependentReviewReceipt;
  reviewContext?: PullRequestReviewContext;
  currentBase?: string;
  currentHead?: string;
  issuerId?: string | undefined;
} = {}) {
  const publishVerificationSignal = vi.fn().mockResolvedValue(undefined);
  const signal: VerificationSignal = {
    id: "9001",
    name: expectedReviewSignalName(review),
    status: "passed",
    commitSha: review.headSha,
    provider: "github",
    ...(issuerId === undefined
      ? {}
      : { issuer: { kind: "app" as const, id: issuerId, name: "founder-control-room-review" } }),
  };
  const implementation = {
    name: "github",
    getPullRequestReviewContext: vi.fn().mockResolvedValue(reviewContext),
    resolveRef: vi.fn().mockImplementation(async (_projectId: string, ref: string) =>
      ref === reviewContext.baseRef ? currentBase : currentHead),
    publishVerificationSignal,
    listVerificationSignals: vi.fn().mockResolvedValue([signal]),
  } as unknown as VerificationSignalPublishingProvider;
  return { implementation, publishVerificationSignal };
}

describe("deterministic review witness publisher", () => {
  it("publishes the receipt-derived exact-head signal and verifies the trusted App issuer", async () => {
    const review = receipt();
    const { implementation, publishVerificationSignal } = provider({ review });

    const result = await publishDeterministicReviewWitness({
      provider: implementation,
      projectId: "founder-control-room",
      receipt: review,
      trustedGitHubAppId: APP_ID,
    });

    expect(publishVerificationSignal).toHaveBeenCalledTimes(1);
    expect(publishVerificationSignal).toHaveBeenCalledWith("founder-control-room", expect.objectContaining({
      name: expectedReviewSignalName(review),
      commitSha: HEAD,
      status: "passed",
    }));
    expect(result.signalName).toBe(expectedReviewSignalName(review));
    expect(result.issuerAppId).toBe(APP_ID);
    expect(result.mergeAuthorized).toBe(false);
    expect(result.executionAuthorized).toBe(false);
  });

  it("refuses to publish blocked or unresolved deterministic review", async () => {
    const blocked = receipt({
      findings: [{
        id: "p1",
        severity: "P1",
        title: "blocked",
        path: "src/example.ts",
        line: null,
        evidence: "blocked",
        recommendation: "repair",
      }],
      verdict: "blocked",
    });
    blocked.reviewHash = independentReviewHash(blocked);
    const { implementation, publishVerificationSignal } = provider({ review: blocked });

    await expect(publishDeterministicReviewWitness({
      provider: implementation,
      projectId: "founder-control-room",
      receipt: blocked,
      trustedGitHubAppId: APP_ID,
    })).rejects.toThrow(/must not publish/i);
    expect(publishVerificationSignal).not.toHaveBeenCalled();
  });

  it("rejects wrong or missing trusted App issuer on provider readback", async () => {
    const review = receipt();
    for (const issuerId of ["99999", undefined]) {
      const { implementation } = provider({ review, issuerId });
      await expect(publishDeterministicReviewWitness({
        provider: implementation,
        projectId: "founder-control-room",
        receipt: review,
        trustedGitHubAppId: APP_ID,
      })).rejects.toThrow(/trusted GitHub App issuer/i);
    }
  });

  it("fails before publication when base or head moved after review", async () => {
    const review = receipt();
    for (const state of [
      { currentBase: "e".repeat(40), currentHead: HEAD },
      { currentBase: BASE, currentHead: "f".repeat(40) },
    ]) {
      const { implementation, publishVerificationSignal } = provider({ review, ...state });
      await expect(publishDeterministicReviewWitness({
        provider: implementation,
        projectId: "founder-control-room",
        receipt: review,
        trustedGitHubAppId: APP_ID,
      })).rejects.toThrow(/moved before publication/i);
      expect(publishVerificationSignal).not.toHaveBeenCalled();
    }
  });

  it("fails before publication when immutable provider PR identity no longer matches the receipt", async () => {
    const review = receipt();
    const { implementation, publishVerificationSignal } = provider({
      review,
      reviewContext: context({ headSha: "f".repeat(40) }),
    });

    await expect(publishDeterministicReviewWitness({
      provider: implementation,
      projectId: "founder-control-room",
      receipt: review,
      trustedGitHubAppId: APP_ID,
    })).rejects.toThrow(/head changed after review/i);
    expect(publishVerificationSignal).not.toHaveBeenCalled();
  });

  it("rejects malformed receipt identity and non-numeric trusted App identity", async () => {
    const malformed = receipt();
    malformed.summary = "tampered";
    const { implementation, publishVerificationSignal } = provider({ review: malformed });

    await expect(publishDeterministicReviewWitness({
      provider: implementation,
      projectId: "founder-control-room",
      receipt: malformed,
      trustedGitHubAppId: APP_ID,
    })).rejects.toThrow(/receipt hash does not match/i);
    expect(publishVerificationSignal).not.toHaveBeenCalled();

    const valid = receipt();
    await expect(publishDeterministicReviewWitness({
      provider: provider({ review: valid }).implementation,
      projectId: "founder-control-room",
      receipt: valid,
      trustedGitHubAppId: "not-an-app-id",
    })).rejects.toThrow(/numeric trusted GitHub App id/i);
  });
});
