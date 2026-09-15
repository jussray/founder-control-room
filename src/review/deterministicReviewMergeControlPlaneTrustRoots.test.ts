import { describe, expect, it } from "vitest";
import { evaluateDeterministicReviewRules } from "./deterministicReviewProducer.js";

const MERGE_CONTROL_PLANE_TRUST_ROOTS = [
  ".github/workflows/control-room-test-ledger.yml",
  ".github/workflows/pr-continuity.yml",
  "scripts/control-room-test-ledger.mjs",
  "scripts/founder-merge-approval.mjs",
  "scripts/pr-continuity.mjs",
  "scripts/verify-pr-continuity-rollover-outcome.mjs",
] as const;

const MERGE_AUTHORITY_TRUTH_COMPANIONS = [
  "README.md",
  "docs/FOUNDER_MERGE_AUTHORITY.md",
  "GLOBAL_AI.md",
  ".ai/skills/juss-flow-launch-loop/SKILL.md",
  "docs/DOCUMENTATION_TRUTH_RECEIPT.json",
] as const;

function file(path: string) {
  return {
    path,
    status: "modified" as const,
    additions: 1,
    deletions: 1,
    patch: `@@ -1 +1 @@\n-old ${path}\n+new ${path}`,
  };
}

describe("deterministic review merge-control-plane trust roots", () => {
  it.each(MERGE_CONTROL_PLANE_TRUST_ROOTS)(
    "blocks %s from certifying itself through the normal deterministic reviewer",
    (path) => {
      const findings = evaluateDeterministicReviewRules([file(path)]);

      expect(findings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "trust-root-self-modification",
          severity: "P1",
          path,
        }),
        expect.objectContaining({
          id: "merge-authority-truth-coupling",
          severity: "P2",
        }),
      ]));
    },
  );

  it("keeps the constitutional P1 even when all merge-authority truth companions are present", () => {
    const findings = evaluateDeterministicReviewRules([
      file(".github/workflows/control-room-test-ledger.yml"),
      ...MERGE_AUTHORITY_TRUTH_COMPANIONS.map(file),
    ]);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "trust-root-self-modification",
        severity: "P1",
        path: ".github/workflows/control-room-test-ledger.yml",
      }),
    ]));
    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "merge-authority-truth-coupling" }),
    ]));
  });
});
