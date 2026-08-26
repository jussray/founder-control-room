import { describe, expect, it } from "vitest";
import type {
  Diff,
  PullRequestReviewContext,
  RepositoryProvider,
} from "../providers/RepositoryProvider.js";
import {
  FCR_FOUNDER_FINAL_REVIEW_POLICY,
  independentReviewPolicyHash,
} from "./independentReviewGate.js";
import {
  DETERMINISTIC_REVIEWER_ID,
  DETERMINISTIC_REVIEW_RULESET,
  evaluateDeterministicReviewRules,
  produceDeterministicReview,
} from "./deterministicReviewProducer.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);

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

function providerFor({
  context = defaultContext,
  diff = defaultDiff,
  currentBase = BASE,
  currentHead = HEAD,
}: {
  context?: PullRequestReviewContext;
  diff?: Diff;
  currentBase?: string;
  currentHead?: string;
} = {}): RepositoryProvider {
  return {
    name: "github",
    getPullRequestReviewContext: async () => context,
    resolveRef: async (_projectId: string, ref: string) => ref === context.baseRef ? currentBase : currentHead,
    compare: async () => diff,
  } as unknown as RepositoryProvider;
}

function file(path: string) {
  return {
    path,
    status: "modified" as const,
    additions: 1,
    deletions: 1,
    patch: `@@ -1 +1 @@\n-old ${path}\n+new ${path}`,
  };
}

describe("deterministic review producer", () => {
  it("produces the same canonical receipt hash for the same provider truth", async () => {
    const provider = providerFor();
    const first = await produceDeterministicReview({ provider, projectId: "founder-control-room", pullRequestNumber: 706 });
    const second = await produceDeterministicReview({ provider, projectId: "founder-control-room", pullRequestNumber: 706 });

    expect(first.receipt).toEqual(second.receipt);
    expect(first.receipt.reviewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.receipt.reviewer).toEqual({
      id: DETERMINISTIC_REVIEWER_ID,
      kind: "deterministic",
      provider: "github",
      runtime: DETERMINISTIC_REVIEW_RULESET,
    });
    expect(first.receipt.policyHash).toBe(independentReviewPolicyHash(FCR_FOUNDER_FINAL_REVIEW_POLICY));
    expect(first.receipt.proposalOnly).toBe(true);
    expect(first.receipt.mergeAuthorized).toBe(false);
    expect(first.receipt.executionAuthorized).toBe(false);
    expect(first.receipt.verdict).toBe("clear");
    expect(first.publishable).toBe(true);
  });

  it("changes the receipt identity when the exact diff changes", async () => {
    const first = await produceDeterministicReview({
      provider: providerFor(),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    });
    const changedDiff = {
      ...defaultDiff,
      files: [file("src/another.ts")],
    };
    const second = await produceDeterministicReview({
      provider: providerFor({ diff: changedDiff }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    });

    expect(second.receipt.diffHash).not.toBe(first.receipt.diffHash);
    expect(second.receipt.reviewHash).not.toBe(first.receipt.reviewHash);
  });

  it("fails closed when the provider base or head moves after PR context read", async () => {
    await expect(produceDeterministicReview({
      provider: providerFor({ currentBase: "c".repeat(40) }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/base moved/i);

    await expect(produceDeterministicReview({
      provider: providerFor({ currentHead: "c".repeat(40) }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/head moved/i);
  });

  it("fails closed when provider diff content is incomplete", async () => {
    const incomplete: Diff = {
      ...defaultDiff,
      files: [{
        path: "src/incomplete.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
      }],
    };
    await expect(produceDeterministicReview({
      provider: providerFor({ diff: incomplete }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/diff content is incomplete/i);
  });

  it("fails closed when the candidate is behind its provider base", async () => {
    await expect(produceDeterministicReview({
      provider: providerFor({ diff: { ...defaultDiff, behindBy: 1 } }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/fresh candidate/i);
  });

  it("blocks trust-root self-modification instead of self-certifying it", async () => {
    const diff: Diff = {
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
    const result = await produceDeterministicReview({
      provider: providerFor({ diff }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    });

    expect(result.receipt.verdict).toBe("blocked");
    expect(result.publishable).toBe(false);
    expect(result.receipt.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "trust-root-self-modification", severity: "P1" }),
    ]));
  });

  it("requires discovery adversarial tests and runbook when discovery core changes", () => {
    const findings = evaluateDeterministicReviewRules([
      file("scripts/verify-test-discovery.mjs"),
    ]);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "test-discovery-proof-coupling", severity: "P2" }),
    ]));

    const repaired = evaluateDeterministicReviewRules([
      file("scripts/verify-test-discovery.mjs"),
      file("scripts/verify-test-discovery.node-test.mjs"),
      file("docs/TEST_DISCOVERY_DEBT.md"),
    ]);
    expect(repaired.some((item) => item.id === "test-discovery-proof-coupling")).toBe(false);
  });

  it("requires canonical truth companions for merge-authority and provider source", () => {
    const mergeFindings = evaluateDeterministicReviewRules([file("src/review/exampleAuthority.ts")]);
    expect(mergeFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "merge-authority-truth-coupling", severity: "P2" }),
    ]));

    const providerFindings = evaluateDeterministicReviewRules([file("src/providers/exampleProvider.ts")]);
    expect(providerFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "provider-authority-truth-coupling", severity: "P2" }),
    ]));
  });

  it("rejects caller attempts to redirect the producer to another repository/provider", async () => {
    await expect(produceDeterministicReview({
      provider: providerFor({
        context: { ...defaultContext, repository: "attacker/repo", headRepository: "attacker/repo" },
      }),
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/canonical Founder Control Room repository/i);

    const nonGitHub = providerFor();
    Object.defineProperty(nonGitHub, "name", { value: "gitlab" });
    await expect(produceDeterministicReview({
      provider: nonGitHub,
      projectId: "founder-control-room",
      pullRequestNumber: 706,
    })).rejects.toThrow(/GitHub repository provider/i);
  });
});
