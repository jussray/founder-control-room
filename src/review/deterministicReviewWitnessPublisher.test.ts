import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Diff,
  PullRequestReviewContext,
  RepositoryProvider,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
import { expectedReviewSignalName } from "./independentReviewGate.js";
import { publishDeterministicReviewWitness } from "./deterministicReviewWitnessPublisher.js";

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

interface ProviderFixture {
  provider: RepositoryProvider;
  publish: ReturnType<typeof vi.fn>;
}

function providerFor(options: {
  diff?: Diff;
  contexts?: PullRequestReviewContext[];
  signalFactory?: (name: string, evidenceFingerprint: string) => VerificationSignal[];
  publicationAvailable?: boolean;
} = {}): ProviderFixture {
  const contexts = [...(options.contexts ?? [context, context, context])];
  let expectedName = "";
  let expectedFingerprint = "";
  const publish = vi.fn(async (_projectId: string, publication: { name: string; reviewHash: string }) => {
    expectedName = publication.name;
    expectedFingerprint = publication.reviewHash;
  });

  const provider = {
    name: "github",
    getPullRequestReviewContext: async () => contexts.shift() ?? context,
    resolveRef: async (_projectId: string, ref: string) => ref === "main" ? BASE : HEAD,
    compare: async () => options.diff ?? clearDiff,
    listVerificationSignals: async () => options.signalFactory?.(expectedName, expectedFingerprint) ?? [{
      id: "check-1",
      name: expectedName,
      status: "passed",
      commitSha: HEAD,
      provider: "github",
      evidenceFingerprint: expectedFingerprint,
      issuer: { kind: "app", id: TRUSTED_APP_ID, name: "fcr-review" },
    }],
    getRef: async () => ({ name: HEAD, commitSha: HEAD }),
    ...(options.publicationAvailable === false ? {} : { publishDeterministicReviewWitness: publish }),
  } as unknown as RepositoryProvider;

  return { provider, publish };
}

beforeEach(() => {
  vi.stubEnv("GITHUB_APP_ID", TRUSTED_APP_ID);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deterministic review witness publisher", () => {
  it("publishes only the derived exact-head identity and accepts trusted App readback", async () => {
    const { provider, publish } = providerFor();

    const result = await publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    });

    expect(publish).toHaveBeenCalledTimes(1);
    const [projectId, publication] = publish.mock.calls[0]!;
    expect(projectId).toBe("founder-control-room");
    expect(publication.headSha).toBe(HEAD);
    expect(publication.name).toBe(expectedReviewSignalName(result.production.receipt));
    expect(publication.reviewHash).toBe(result.production.receipt.reviewHash);
    expect(publication.summary).toBe(result.production.receipt.summary);
    expect(result.signal.evidenceFingerprint).toBe(result.production.receipt.reviewHash);
    expect(result.signal.issuer?.id).toBe(TRUSTED_APP_ID);
    expect(result.production.receipt.mergeAuthorized).toBe(false);
    expect(result.production.receipt.executionAuthorized).toBe(false);
  });

  it("reconciles an existing trusted exact witness before creating another Check Run", async () => {
    const { provider, publish } = providerFor();

    const first = await publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    });
    const second = await publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(second.production.receipt.reviewHash).toBe(first.production.receipt.reviewHash);
    expect(second.signal.evidenceFingerprint).toBe(first.production.receipt.reviewHash);
    expect(second.signal.issuer?.id).toBe(TRUSTED_APP_ID);
  });

  it("fails closed when the repository provider has no App witness capability", async () => {
    const { provider, publish } = providerFor({ publicationAvailable: false });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/server-owned GitHub App provider authority/i);
    expect(publish).not.toHaveBeenCalled();
  });

  it("never publishes a blocked trust-root review", async () => {
    const { provider, publish } = providerFor({
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

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/not publishable/i);
    expect(publish).not.toHaveBeenCalled();
  });

  it("fails closed before publication when server-owned App identity is missing or malformed", async () => {
    for (const value of ["", "not-an-app"]) {
      vi.stubEnv("GITHUB_APP_ID", value);
      const { provider, publish } = providerFor();
      await expect(publishDeterministicReviewWitness({
        provider,
        projectId: "founder-control-room",
        pullRequestNumber: 706,
      })).rejects.toThrow(/numeric server-owned GITHUB_APP_ID/i);
      expect(publish).not.toHaveBeenCalled();
    }
  });

  it("rejects a same-name green witness from the wrong App issuer", async () => {
    const { provider } = providerFor({
      signalFactory: (name, evidenceFingerprint) => [{
        id: "check-wrong-app",
        name,
        status: "passed",
        commitSha: HEAD,
        provider: "github",
        evidenceFingerprint,
        issuer: { kind: "app", id: "99999", name: "other-app" },
      }],
    });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/trusted GitHub App 12345/i);
  });

  it("rejects a neutral-derived non-authorizing witness even when identity otherwise matches", async () => {
    const { provider } = providerFor({
      signalFactory: (name, evidenceFingerprint) => [{
        id: "check-neutral",
        name,
        status: "unknown",
        commitSha: HEAD,
        provider: "github",
        evidenceFingerprint,
        issuer: { kind: "app", id: TRUSTED_APP_ID, name: "fcr-review" },
      }],
    });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/witness readback is missing/i);
  });

  it("rejects a same-name trusted-App witness with a different full review fingerprint", async () => {
    const { provider } = providerFor({
      signalFactory: (name, evidenceFingerprint) => [{
        id: "check-collision",
        name,
        status: "passed",
        commitSha: HEAD,
        provider: "github",
        evidenceFingerprint: `${evidenceFingerprint.slice(0, 12)}${"f".repeat(52)}`,
        issuer: { kind: "app", id: TRUSTED_APP_ID, name: "fcr-review" },
      }],
    });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/full receipt fingerprint/i);
  });

  it("rejects a trusted-App witness when full fingerprint readback is missing", async () => {
    const { provider } = providerFor({
      signalFactory: (name) => [{
        id: "check-no-fingerprint",
        name,
        status: "passed",
        commitSha: HEAD,
        provider: "github",
        issuer: { kind: "app", id: TRUSTED_APP_ID, name: "fcr-review" },
      }],
    });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/full receipt fingerprint/i);
  });

  it("rejects stale or failed provider readback even when the name and fingerprint match", async () => {
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
      const { provider } = providerFor({
        signalFactory: (name, evidenceFingerprint) => [{
          ...signal,
          name,
          provider: "github",
          evidenceFingerprint,
          issuer: { kind: "app", id: TRUSTED_APP_ID, name: "fcr-review" },
        }],
      });

      await expect(publishDeterministicReviewWitness({
        provider,
        projectId: "founder-control-room",
        pullRequestNumber: 706,
      })).rejects.toThrow(/witness readback is missing/i);
    }
  });

  it("withholds publication when the PR identity moves after production but before publish", async () => {
    const moved = { ...context, headSha: "c".repeat(40) };
    const { provider, publish } = providerFor({ contexts: [context, moved] });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/moved before witness publication/i);
    expect(publish).not.toHaveBeenCalled();
  });

  it("withholds publication when the PR is retargeted away from main at the same base SHA", async () => {
    const moved = { ...context, baseRef: "release" };
    const { provider, publish } = providerFor({ contexts: [context, moved] });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/moved before witness publication/i);
    expect(publish).not.toHaveBeenCalled();
  });

  it("withholds publication when provider-backed author identity changes", async () => {
    const moved = { ...context, authorIdentity: "other-founder" };
    const { provider, publish } = providerFor({ contexts: [context, moved] });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/moved before witness publication/i);
    expect(publish).not.toHaveBeenCalled();
  });

  it("reports the witness historical if the PR moves after publication", async () => {
    const moved = { ...context, headSha: "c".repeat(40) };
    const { provider, publish } = providerFor({ contexts: [context, context, moved] });

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/moved after witness publication/i);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
