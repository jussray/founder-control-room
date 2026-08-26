import { describe, expect, it } from "vitest";
import type {
  Diff,
  PullRequestReviewContext,
  RepositoryProvider,
} from "../providers/RepositoryProvider.js";
import { produceDeterministicReview } from "./deterministicReviewProducer.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);

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

function diffWithFiles(count: number): Diff {
  return {
    base: BASE,
    head: HEAD,
    aheadBy: 1,
    behindBy: 0,
    files: Array.from({ length: count }, (_, index) => ({
      path: `src/generated/file-${index}.ts`,
      status: "modified" as const,
      additions: 1,
      deletions: 1,
      patch: `@@ -1 +1 @@\n-old-${index}\n+new-${index}`,
    })),
  };
}

function providerFor(
  overrides: {
    context?: PullRequestReviewContext;
    diff?: Diff;
  } = {},
): RepositoryProvider {
  const selectedContext = overrides.context ?? context;
  const selectedDiff = overrides.diff ?? diffWithFiles(1);
  return {
    name: "github",
    getPullRequestReviewContext: async () => selectedContext,
    resolveRef: async (_projectId: string, ref: string) =>
      ref === selectedContext.baseRef ? selectedContext.baseSha : selectedContext.headSha,
    compare: async () => selectedDiff,
  } as unknown as RepositoryProvider;
}

describe("deterministic review producer hard boundaries", () => {
  it("rejects provider context for a different PR number", async () => {
    await expect(produceDeterministicReview({
      provider: providerFor({ context: { ...context, number: 999 } }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/returned PR #999 for requested PR #706/i);
  });

  it("rejects the provider completeness ceiling at 300 changed files", async () => {
    await expect(produceDeterministicReview({
      provider: providerFor({ diff: diffWithFiles(300) }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/diff completeness is unproven for 300 files/i);
  });

  it("rejects a pull request targeting a base other than canonical main", async () => {
    await expect(produceDeterministicReview({
      provider: providerFor({ context: { ...context, baseRef: "release" } }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/pinned to base ref main/i);
  });

  it("rejects fork substitution even when the repository field looks canonical", async () => {
    await expect(produceDeterministicReview({
      provider: providerFor({ context: { ...context, headRepository: "attacker/founder-control-room" } }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/canonical Founder Control Room repository/i);
  });
});
