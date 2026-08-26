import { describe, expect, it } from "vitest";
import type {
  Diff,
  PullRequestReviewContext,
  RepositoryProvider,
} from "../providers/RepositoryProvider.js";
import {
  DeterministicReviewProductionError,
  FCR_DETERMINISTIC_REVIEW_RULE_VERSION,
  FCR_DETERMINISTIC_REVIEWER_ID,
  produceFcrDeterministicReview,
} from "./deterministicReviewProducer.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const OTHER_HEAD = "c".repeat(40);
const REPOSITORY = "jussray/founder-control-room";

function context(overrides: Partial<PullRequestReviewContext> = {}): PullRequestReviewContext {
  return {
    number: 706,
    repository: REPOSITORY,
    headRepository: REPOSITORY,
    baseRef: "main",
    headRef: "fix/test-discovery-runner-truth-6601086",
    baseSha: BASE,
    headSha: HEAD,
    authorIdentity: "jussray",
    ...overrides,
  };
}

function file(path: string, patch = "@@ -1 +1 @@\n-old\n+new") {
  return {
    path,
    status: "modified" as const,
    additions: 1,
    deletions: 1,
    patch,
  };
}

function diff(files = [file("src/goalfix/engine.ts")], overrides: Partial<Diff> = {}): Diff {
  return {
    base: BASE,
    head: HEAD,
    files,
    aheadBy: 1,
    behindBy: 0,
    ...overrides,
  };
}

function provider({
  reviewContext = context(),
  reviewedDiff = diff(),
  resolvedBase = reviewContext.baseSha,
  resolvedHead = reviewContext.headSha,
}: {
  reviewContext?: PullRequestReviewContext;
  reviewedDiff?: Diff;
  resolvedBase?: string;
  resolvedHead?: string;
} = {}): RepositoryProvider {
  return {
    name: "github",
    getPullRequestReviewContext: async () => reviewContext,
    resolveRef: async (_projectId: string, ref: string) =>
      ref === reviewContext.baseRef ? resolvedBase : resolvedHead,
    compare: async () => reviewedDiff,
  } as unknown as RepositoryProvider;
}

describe("FCR deterministic review producer v1", () => {
  it("produces the same receipt hash for the same exact provider inputs", async () => {
    const first = await produceFcrDeterministicReview(provider(), 706);
    const second = await produceFcrDeterministicReview(provider(), 706);

    expect(first.receipt).toEqual(second.receipt);
    expect(first.receipt.verdict).toBe("clear");
    expect(first.receipt.findings).toEqual([]);
    expect(first.receipt.reviewer).toEqual({
      id: FCR_DETERMINISTIC_REVIEWER_ID,
      kind: "deterministic",
      provider: "github",
      runtime: FCR_DETERMINISTIC_REVIEW_RULE_VERSION,
    });
    expect(first.receipt.proposalOnly).toBe(true);
    expect(first.receipt.mergeAuthorized).toBe(false);
    expect(first.receipt.executionAuthorized).toBe(false);
    expect(first.receipt.reviewHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes receipt identity when the exact reviewed head changes", async () => {
    const first = await produceFcrDeterministicReview(provider(), 706);
    const changedContext = context({ headSha: OTHER_HEAD });
    const changed = await produceFcrDeterministicReview(provider({
      reviewContext: changedContext,
      resolvedHead: OTHER_HEAD,
      reviewedDiff: diff([file("src/goalfix/engine.ts")], { head: OTHER_HEAD }),
    }), 706);

    expect(changed.receipt.headSha).toBe(OTHER_HEAD);
    expect(changed.receipt.reviewHash).not.toBe(first.receipt.reviewHash);
  });

  it("rejects fork substitution before producing a receipt", async () => {
    const reviewContext = context({ headRepository: "attacker/fork" });
    await expect(produceFcrDeterministicReview(provider({ reviewContext }), 706))
      .rejects.toThrow(/fork substitution/i);
  });

  it("rejects a head that moves after provider review context is read", async () => {
    await expect(produceFcrDeterministicReview(provider({ resolvedHead: OTHER_HEAD }), 706))
      .rejects.toThrow(/Head moved/i);
  });

  it("rejects stale candidates that are behind the reviewed base", async () => {
    await expect(produceFcrDeterministicReview(provider({
      reviewedDiff: diff([file("src/goalfix/engine.ts")], { behindBy: 1 }),
    }), 706)).rejects.toThrow(/current with its base/i);
  });

  it("rejects incomplete diff content instead of hashing an unreviewed file", async () => {
    const incomplete = diff([{ ...file("src/goalfix/engine.ts"), patch: undefined }]);
    await expect(produceFcrDeterministicReview(provider({ reviewedDiff: incomplete }), 706))
      .rejects.toThrow(DeterministicReviewProductionError);
  });

  it("blocks trust-root self-modification and never returns authority", async () => {
    const reviewedDiff = diff([
      file("src/review/independentReviewGate.ts"),
      file("docs/FOUNDER_MERGE_AUTHORITY.md"),
    ]);
    const result = await produceFcrDeterministicReview(provider({ reviewedDiff }), 706);

    expect(result.receipt.verdict).toBe("blocked");
    expect(result.receipt.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "trust-root-self-modification",
        severity: "P1",
      }),
    ]));
    expect(result.receipt.mergeAuthorized).toBe(false);
    expect(result.receipt.executionAuthorized).toBe(false);
  });

  it("accepts the #706-style discovery authority coupling when both companions move", async () => {
    const reviewedDiff = diff([
      file("vitest.config.ts"),
      file("scripts/verify-test-discovery.mjs"),
      file("scripts/test-discovery-baseline.json"),
      file("scripts/verify-test-discovery.node-test.mjs"),
      file("docs/TEST_DISCOVERY_DEBT.md"),
    ]);
    const result = await produceFcrDeterministicReview(provider({ reviewedDiff }), 706);

    expect(result.receipt.verdict).toBe("clear");
    expect(result.receipt.findings).toEqual([]);
  });

  it("returns needs_review when discovery authority changes without both companions", async () => {
    const reviewedDiff = diff([
      file("vitest.config.ts"),
      file("scripts/verify-test-discovery.mjs"),
    ]);
    const result = await produceFcrDeterministicReview(provider({ reviewedDiff }), 706);

    expect(result.receipt.verdict).toBe("needs_review");
    expect(result.receipt.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "test-discovery-companion-missing",
        severity: "P2",
      }),
    ]));
  });

  it("requires founder merge-authority truth when non-test review authority source changes", async () => {
    const reviewedDiff = diff([file("src/review/reviewerFailoverBroker.ts")]);
    const result = await produceFcrDeterministicReview(provider({ reviewedDiff }), 706);

    expect(result.receipt.verdict).toBe("needs_review");
    expect(result.receipt.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "merge-authority-truth-companion-missing", severity: "P2" }),
    ]));
  });

  it("requires provider truth documentation when non-test provider source changes", async () => {
    const reviewedDiff = diff([file("src/providers/providerFactory.ts")]);
    const result = await produceFcrDeterministicReview(provider({ reviewedDiff }), 706);

    expect(result.receipt.verdict).toBe("needs_review");
    expect(result.receipt.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "provider-truth-companion-missing", severity: "P2" }),
    ]));
  });
});
