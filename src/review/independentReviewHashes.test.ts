import { describe, expect, it } from "vitest";
import type { Diff } from "../providers/RepositoryProvider.js";
import {
  independentReviewDiffHash,
  independentReviewPolicyHash,
  type IndependentReviewPolicy,
} from "./independentReviewGate.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);

const policy: IndependentReviewPolicy = {
  requiredSemanticReviews: 1,
  requireDeterministicReview: true,
  blockOnP2: true,
  trustedSemanticReviewerIds: ["Reviewer-B", "reviewer-a"],
};

function diff(files: Diff["files"]): Diff {
  return {
    base: BASE,
    head: HEAD,
    aheadBy: 1,
    behindBy: 0,
    files,
  };
}

describe("independent review canonical hashes", () => {
  it("normalizes trusted reviewer case and ordering into one policy hash", () => {
    const reordered: IndependentReviewPolicy = {
      ...policy,
      trustedSemanticReviewerIds: ["REVIEWER-A", "reviewer-b"],
    };

    expect(independentReviewPolicyHash(reordered)).toBe(independentReviewPolicyHash(policy));
  });

  it("changes the policy hash when the load-bearing review requirements change", () => {
    expect(independentReviewPolicyHash({ ...policy, requiredSemanticReviews: 2 }))
      .not.toBe(independentReviewPolicyHash(policy));
    expect(independentReviewPolicyHash({ ...policy, requireDeterministicReview: false }))
      .not.toBe(independentReviewPolicyHash(policy));
  });

  it("is stable across provider file ordering for the same exact diff", () => {
    const first = diff([
      { path: "src/b.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ b @@" },
      { path: "src/a.ts", status: "added", additions: 1, deletions: 0, patch: "@@ a @@" },
    ]);
    const reordered = diff([...first.files].reverse());

    expect(independentReviewDiffHash(reordered)).toBe(independentReviewDiffHash(first));
  });

  it("changes the diff hash when patch content or ancestry changes", () => {
    const original = diff([
      { path: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ old @@" },
    ]);
    const changedPatch = diff([
      { path: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ new @@" },
    ]);
    const staleBase = { ...original, behindBy: 1 };

    expect(independentReviewDiffHash(changedPatch)).not.toBe(independentReviewDiffHash(original));
    expect(independentReviewDiffHash(staleBase)).not.toBe(independentReviewDiffHash(original));
  });
});
