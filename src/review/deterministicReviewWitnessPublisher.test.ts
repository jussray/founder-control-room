import { describe, expect, it, vi } from "vitest";
import type {
  Diff,
  PullRequestReviewContext,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
import {
  expectedReviewSignalName,
  independentReviewHash,
} from "./independentReviewGate.js";
import { produceDeterministicReview } from "./deterministicReviewProducer.js";
import {
  publishDeterministicReviewWitness,
  type VerificationSignalPublication,
  type VerificationSignalPublishingProvider,
} from "./deterministicReviewWitnessPublisher.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const APP_ID = "12345";

const defaultContext: PullRequestReviewContext = {
  number: 706,
  repository: "jussray/founder-control-room",
  headRepository: "jussray/founder-control-room",
  baseRef: "main",
  headRef: "fix/test-discovery",
  baseSha: BASE,
  headSha: HEAD,
  authorIdentity: "jussray",
};

const defaultDiff: Diff = {
  base: BASE,
  head: HEAD,
  aheadBy: 1,
  behindBy: 0,
  files: [{
    path: "src/example.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    patch: "@@ -1 +1 @@\n-old\n+new",
  }],
};

function file(path: string) {
  return {
    path,
    status: "modified" as const,
    additions: 1,
    deletions: 1,
    patch: `@@ -1 +1 @@\n-old ${path}\n+new ${path}`,
  };
}

function provider({
  reviewContext = defaultContext,
  diff = defaultDiff,
  issuerId = APP_ID,
}: {
  reviewContext?: PullRequestReviewContext;
  diff?: Diff;
  issuerId?: string | undefined;
} = {}) {
  const state = {
    currentBase: reviewContext.baseSha,
    currentHead: reviewContext.headSha,
    publication: undefined as VerificationSignalPublication | undefined,
  };
  const publishVerificationSignal = vi.fn().mockImplementation(async (
    _projectId: string,
    publication: VerificationSignalPublication,
  ) => {
    state.publication = publication;
  });
  const implementation = {
    name: "github",
    getPullRequestReviewContext: vi.fn().mockResolvedValue(reviewContext),
    resolveRef: vi.fn().mockImplementation(async (_projectId: string, ref: string) =>
      ref === reviewContext.baseRef ? state.currentBase : state.currentHead),
    compare: vi.fn().mockResolvedValue(diff),
    publishVerificationSignal,
    listVerificationSignals: vi.fn().mockImplementation(async () => {
      if (!state.publication) return [];
      const signal: VerificationSignal = {
        id: "9001",
        name: state.publication.name,
        status: state.publication.status,
        commitSha: state.publication.commitSha,
        provider: "github",
        ...(issuerId === undefined
          ? {}
          : { issuer: { kind: "app" as const, id: issuerId, name: "founder-control-room-review" } }),
      };
      return [signal];
    }),
  } as unknown as VerificationSignalPublishingProvider;
  return { implementation, publishVerificationSignal, state };
}

async function freshReceipt(implementation: VerificationSignalPublishingProvider) {
  return (await produceDeterministicReview({
    provider: implementation,
    projectId: "founder-control-room",
    pullRequestNumber: 706,
  })).receipt;
}

describe("deterministic review witness publisher", () => {
  it("re-derives trusted producer truth, publishes the exact signal, and verifies the App issuer", async () => {
    const { implementation, publishVerificationSignal } = provider();
    const review = await freshReceipt(implementation);

    const result = await publishDeterministicReviewWitness({
      provider: implementation,
      projectId: "founder-control-room",
      receipt: review,
      env: { GITHUB_APP_ID: APP_ID },
    });

    expect(publishVerificationSignal).toHaveBeenCalledTimes(1);
    expect(publishVerificationSignal).toHaveBeenCalledWith("founder-control-room", expect.objectContaining({
      name: expectedReviewSignalName(review),
      commitSha: HEAD,
      status: "passed",
    }));
    expect(result.receipt.reviewHash).toBe(review.reviewHash);
    expect(result.signalName).toBe(expectedReviewSignalName(review));
    expect(result.issuerAppId).toBe(APP_ID);
    expect(result.mergeAuthorized).toBe(false);
    expect(result.executionAuthorized).toBe(false);
  });

  it("refuses to publish a blocked fresh deterministic review", async () => {
    const blockedDiff: Diff = {
      ...defaultDiff,
      files: [
        file("src/review/deterministicReviewProducer.ts"),
        file("README.md"),
        file("docs/FOUNDER_MERGE_AUTHORITY.md"),
        file("GLOBAL_AI.md"),
        file(".ai/skills/juss-flow-launch-loop/SKILL.md"),
        file("docs/DOCUMENTATION_TRUTH_RECEIPT.json"),
      ],
    };
    const { implementation, publishVerificationSignal } = provider({ diff: blockedDiff });
    const review = await freshReceipt(implementation);
    expect(review.verdict).toBe("blocked");

    await expect(publishDeterministicReviewWitness({
      provider: implementation,
      projectId: "founder-control-room",
      receipt: review,
      env: { GITHUB_APP_ID: APP_ID },
    })).rejects.toThrow(/must not publish/i);
    expect(publishVerificationSignal).not.toHaveBeenCalled();
  });

  it("rejects wrong or missing trusted App issuer on provider readback", async () => {
    for (const issuerId of ["99999", undefined]) {
      const { implementation } = provider({ issuerId });
      const review = await freshReceipt(implementation);
      await expect(publishDeterministicReviewWitness({
        provider: implementation,
        projectId: "founder-control-room",
        receipt: review,
        env: { GITHUB_APP_ID: APP_ID },
      })).rejects.toThrow(/trusted GitHub App issuer/i);
    }
  });

  it("fails before publication when base or head moves after receipt production", async () => {
    for (const mutate of [
      (state: { currentBase: string; currentHead: string }) => { state.currentBase = "e".repeat(40); },
      (state: { currentBase: string; currentHead: string }) => { state.currentHead = "f".repeat(40); },
    ]) {
      const { implementation, publishVerificationSignal, state } = provider();
      const review = await freshReceipt(implementation);
      mutate(state);

      await expect(publishDeterministicReviewWitness({
        provider: implementation,
        projectId: "founder-control-room",
        receipt: review,
        env: { GITHUB_APP_ID: APP_ID },
      })).rejects.toThrow(/base moved|head moved/i);
      expect(publishVerificationSignal).not.toHaveBeenCalled();
    }
  });

  it("rejects a caller-modified receipt even when the caller recomputes its plain hash", async () => {
    const { implementation, publishVerificationSignal } = provider();
    const review = await freshReceipt(implementation);
    const counterfeit = {
      ...review,
      summary: "caller-chosen clear summary",
      reviewHash: "",
    };
    counterfeit.reviewHash = independentReviewHash(counterfeit);
    expect(counterfeit.reviewHash).not.toBe(review.reviewHash);

    await expect(publishDeterministicReviewWitness({
      provider: implementation,
      projectId: "founder-control-room",
      receipt: counterfeit,
      env: { GITHUB_APP_ID: APP_ID },
    })).rejects.toThrow(/stale or was not derived from current trusted producer truth/i);
    expect(publishVerificationSignal).not.toHaveBeenCalled();
  });

  it("requires server-owned numeric GITHUB_APP_ID", async () => {
    for (const env of [{}, { GITHUB_APP_ID: "not-an-app-id" }]) {
      const { implementation, publishVerificationSignal } = provider();
      const review = await freshReceipt(implementation);
      await expect(publishDeterministicReviewWitness({
        provider: implementation,
        projectId: "founder-control-room",
        receipt: review,
        env,
      })).rejects.toThrow(/numeric server-owned GITHUB_APP_ID/i);
      expect(publishVerificationSignal).not.toHaveBeenCalled();
    }
  });

  it("rejects non-GitHub providers before publication", async () => {
    const { implementation, publishVerificationSignal } = provider();
    Object.defineProperty(implementation, "name", { value: "gitlab" });
    const review = await freshReceipt({
      ...implementation,
      name: "github",
    } as VerificationSignalPublishingProvider);

    await expect(publishDeterministicReviewWitness({
      provider: implementation,
      projectId: "founder-control-room",
      receipt: review,
      env: { GITHUB_APP_ID: APP_ID },
    })).rejects.toThrow(/requires the GitHub repository provider/i);
    expect(publishVerificationSignal).not.toHaveBeenCalled();
  });
});
