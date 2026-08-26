import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Diff,
  PullRequestReviewContext,
  RepositoryProvider,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
import { expectedReviewSignalName } from "./independentReviewGate.js";
import {
  publishDeterministicReviewWitness,
  type DeterministicReviewCheckPublisher,
} from "./deterministicReviewWitnessPublisher.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const TRUSTED_APP_ID = "12345";

const context: PullRequestReviewContext = {
  number: 706,
  repository: "jussray/founder-control-room",
  headRepository: "jussray/founder-control-room",
  baseRef: "main",
  headRef: "candidate",
  baseSha: BASE,
  headSha: HEAD,
  authorIdentity: "jussray",
};

const clearDiff: Diff = {
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

function providerFor(options: {
  diff?: Diff;
  contexts?: PullRequestReviewContext[];
  signalFactory?: (name: string) => VerificationSignal[];
} = {}): RepositoryProvider {
  const contexts = [...(options.contexts ?? [context, context, context])];
  let expectedName = "";

  return {
    name: "github",
    getPullRequestReviewContext: async () => contexts.shift() ?? context,
    resolveRef: async (_projectId: string, ref: string) => ref === "main" ? BASE : HEAD,
    compare: async () => options.diff ?? clearDiff,
    listVerificationSignals: async () => options.signalFactory?.(expectedName) ?? [{
      id: "check-1",
      name: expectedName,
      status: "passed",
      commitSha: HEAD,
      provider: "github",
      issuer: { kind: "app", id: TRUSTED_APP_ID, name: "fcr-review" },
    }],
    getRef: async () => ({ name: HEAD, commitSha: HEAD }),
    __setExpectedName: (value: string) => { expectedName = value; },
  } as unknown as RepositoryProvider;
}

function publisherFor(provider: RepositoryProvider): DeterministicReviewCheckPublisher {
  return {
    publishPassedWitness: vi.fn(async ({ name }) => {
      (provider as unknown as { __setExpectedName(value: string): void }).__setExpectedName(name);
    }),
  };
}

beforeEach(() => {
  vi.stubEnv("GITHUB_APP_ID", TRUSTED_APP_ID);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deterministic review witness publisher", () => {
  it("publishes only the derived exact-head name and accepts trusted App readback", async () => {
    const provider = providerFor();
    const publisher = publisherFor(provider);

    const result = await publishDeterministicReviewWitness({
      provider,
      publisher,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    });

    expect(publisher.publishPassedWitness).toHaveBeenCalledTimes(1);
    const call = vi.mocked(publisher.publishPassedWitness).mock.calls[0]![0];
    expect(call.repository).toBe("jussray/founder-control-room");
    expect(call.headSha).toBe(HEAD);
    expect(call.name).toBe(expectedReviewSignalName(result.production.receipt));
    expect(call.reviewHash).toBe(result.production.receipt.reviewHash);
    expect(result.signal.issuer?.id).toBe(TRUSTED_APP_ID);
    expect(result.production.receipt.mergeAuthorized).toBe(false);
    expect(result.production.receipt.executionAuthorized).toBe(false);
  });

  it("never publishes a blocked trust-root review", async () => {
    const provider = providerFor({
      diff: {
        ...clearDiff,
        files: [{
          path: "src/review/deterministicReviewProducer.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          patch: "@@ -1 +1 @@\n-old\n+new",
        }],
      },
    });
    const publisher = publisherFor(provider);

    await expect(publishDeterministicReviewWitness({
      provider,
      publisher,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/not publishable/i);
    expect(publisher.publishPassedWitness).not.toHaveBeenCalled();
  });

  it("fails closed before publication when server-owned App identity is missing or malformed", async () => {
    for (const value of ["", "not-an-app"]) {
      vi.stubEnv("GITHUB_APP_ID", value);
      const provider = providerFor();
      const publisher = publisherFor(provider);
      await expect(publishDeterministicReviewWitness({
        provider,
        publisher,
        projectId: "founder-control-room",
        pullRequestNumber: 706,
      })).rejects.toThrow(/numeric server-owned GITHUB_APP_ID/i);
      expect(publisher.publishPassedWitness).not.toHaveBeenCalled();
    }
  });

  it("rejects a same-name green witness from the wrong App issuer", async () => {
    const provider = providerFor({
      signalFactory: (name) => [{
        id: "check-wrong-app",
        name,
        status: "passed",
        commitSha: HEAD,
        provider: "github",
        issuer: { kind: "app", id: "99999", name: "other-app" },
      }],
    });
    const publisher = publisherFor(provider);

    await expect(publishDeterministicReviewWitness({
      provider,
      publisher,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/trusted GitHub App 12345/i);
  });

  it("rejects stale or failed provider readback even when the name matches", async () => {
    for (const signal of [
      {
        id: "failed",
        status: "failed" as const,
        commitSha: HEAD,
      },
      {
        id: "stale",
        status: "passed" as const,
        commitSha: "c".repeat(40),
      },
    ]) {
      const provider = providerFor({
        signalFactory: (name) => [{
          ...signal,
          name,
          provider: "github",
          issuer: { kind: "app", id: TRUSTED_APP_ID, name: "fcr-review" },
        }],
      });
      const publisher = publisherFor(provider);

      await expect(publishDeterministicReviewWitness({
        provider,
        publisher,
        projectId: "founder-control-room",
        pullRequestNumber: 706,
      })).rejects.toThrow(/witness readback is missing/i);
    }
  });

  it("withholds publication when the PR identity moves after production but before publish", async () => {
    const moved = { ...context, headSha: "c".repeat(40) };
    const provider = providerFor({ contexts: [context, moved] });
    const publisher = publisherFor(provider);

    await expect(publishDeterministicReviewWitness({
      provider,
      publisher,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/moved before witness publication/i);
    expect(publisher.publishPassedWitness).not.toHaveBeenCalled();
  });

  it("withholds publication when the PR is retargeted away from main at the same base SHA", async () => {
    const moved = { ...context, baseRef: "release" };
    const provider = providerFor({ contexts: [context, moved] });
    const publisher = publisherFor(provider);

    await expect(publishDeterministicReviewWitness({
      provider,
      publisher,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/moved before witness publication/i);
    expect(publisher.publishPassedWitness).not.toHaveBeenCalled();
  });

  it("withholds publication when provider-backed author identity changes", async () => {
    const moved = { ...context, authorIdentity: "other-founder" };
    const provider = providerFor({ contexts: [context, moved] });
    const publisher = publisherFor(provider);

    await expect(publishDeterministicReviewWitness({
      provider,
      publisher,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/moved before witness publication/i);
    expect(publisher.publishPassedWitness).not.toHaveBeenCalled();
  });

  it("reports the witness historical if the PR moves after publication", async () => {
    const moved = { ...context, headSha: "c".repeat(40) };
    const provider = providerFor({ contexts: [context, context, moved] });
    const publisher = publisherFor(provider);

    await expect(publishDeterministicReviewWitness({
      provider,
      publisher,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/moved after witness publication/i);
    expect(publisher.publishPassedWitness).toHaveBeenCalledTimes(1);
  });
});
