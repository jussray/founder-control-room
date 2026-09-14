import { describe, expect, it } from "vitest";
import type {
  RepositoryProvider,
  VerificationSignalStatus,
} from "../providers/RepositoryProvider.js";
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
const DIFF_HASH = "c".repeat(64);
const APP_ID = "12345";

function review(): IndependentReviewReceipt {
  const draft = {
    contract: INDEPENDENT_REVIEW_CONTRACT,
    repository: "jussray/founder-control-room",
    pullRequestNumber: 718,
    baseSha: BASE,
    headSha: HEAD,
    diffHash: DIFF_HASH,
    policyHash: independentReviewPolicyHash(FCR_FOUNDER_FINAL_REVIEW_POLICY),
    reviewer: {
      id: "fcr-deterministic-review-v1",
      kind: "deterministic" as const,
      provider: "github",
      runtime: "fcr/deterministic-review-rules@v1",
    },
    authorIdentity: "jussray",
    findings: [],
    verdict: "clear" as const,
    summary: "Deterministic review completed with no V1 findings.",
    proposalOnly: true as const,
    mergeAuthorized: false as const,
    executionAuthorized: false as const,
    reviewHash: "",
  } satisfies IndependentReviewReceipt;

  return {
    ...draft,
    reviewHash: independentReviewHash(draft),
  };
}

function context(receipt: IndependentReviewReceipt): IndependentReviewContext {
  return {
    projectId: "founder-control-room",
    repository: receipt.repository,
    pullRequestNumber: receipt.pullRequestNumber,
    baseSha: receipt.baseSha,
    headSha: receipt.headSha,
    diffHash: receipt.diffHash,
    policyHash: receipt.policyHash,
    authorIdentity: receipt.authorIdentity,
  };
}

function provider(
  receipt: IndependentReviewReceipt,
  evidenceFingerprint?: string,
  status: VerificationSignalStatus = "passed",
): RepositoryProvider {
  return {
    name: "github",
    getRef: async () => ({ name: HEAD, commitSha: HEAD }),
    listVerificationSignals: async () => [{
      id: "check-1",
      name: expectedReviewSignalName(receipt),
      status,
      commitSha: HEAD,
      provider: "github",
      evidenceFingerprint,
      issuer: { kind: "app", id: APP_ID, name: "fcr-review" },
    }],
  } as unknown as RepositoryProvider;
}

describe("deterministic review full-fingerprint gate", () => {
  it("rejects a same-name trusted-App witness whose full fingerprint belongs to another receipt", async () => {
    const receipt = review();
    const collidingFingerprint = `${receipt.reviewHash.slice(0, 12)}${"f".repeat(52)}`;

    const result = await evaluateIndependentReviewGate(
      provider(receipt, collidingFingerprint),
      context(receipt),
      [receipt],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      { GITHUB_APP_ID: APP_ID },
    );

    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.deterministicClearCount).toBe(0);
    expect(result.witnessedReviewHashes).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.stringMatching(/missing passed exact-head deterministic witness/i),
    ]));
  });

  it("rejects a trusted-App witness when the provider omits the full fingerprint", async () => {
    const receipt = review();

    const result = await evaluateIndependentReviewGate(
      provider(receipt),
      context(receipt),
      [receipt],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      { GITHUB_APP_ID: APP_ID },
    );

    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.witnessedReviewHashes).toEqual([]);
  });

  it("rejects a neutral-derived non-authorizing witness even when exact identity matches", async () => {
    const receipt = review();

    const result = await evaluateIndependentReviewGate(
      provider(receipt, receipt.reviewHash, "unknown"),
      context(receipt),
      [receipt],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      { GITHUB_APP_ID: APP_ID },
    );

    expect(result.reviewGateSatisfied).toBe(false);
    expect(result.deterministicClearCount).toBe(0);
    expect(result.witnessedReviewHashes).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.stringMatching(/missing passed exact-head deterministic witness/i),
    ]));
  });

  it("accepts deterministic witness evidence only when the full receipt fingerprint matches", async () => {
    const receipt = review();

    const result = await evaluateIndependentReviewGate(
      provider(receipt, receipt.reviewHash),
      context(receipt),
      [receipt],
      FCR_FOUNDER_FINAL_REVIEW_POLICY,
      { GITHUB_APP_ID: APP_ID },
    );

    expect(result.reviewGateSatisfied).toBe(true);
    expect(result.deterministicClearCount).toBe(1);
    expect(result.witnessedReviewHashes).toEqual([receipt.reviewHash]);
    expect(result.mergeAuthorized).toBe(false);
    expect(result.executionAuthorized).toBe(false);
  });
});
