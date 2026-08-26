import { describe, expect, it } from "vitest";
import { evaluateDeterministicReviewRules } from "./deterministicReviewProducer.js";

function file(path: string) {
  return {
    path,
    status: "modified" as const,
    additions: 1,
    deletions: 1,
    patch: `@@ -1 +1 @@\n-old ${path}\n+new ${path}`,
  };
}

describe("deterministic review witness execution trust root", () => {
  it.each([
    ".github/workflows/deterministic-review-core-advisory.yml",
    "scripts/publish-deterministic-review-witness.mjs",
  ])("blocks normal self-certification when %s changes", (path) => {
    const findings = evaluateDeterministicReviewRules([file(path)]);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "trust-root-self-modification",
        severity: "P1",
        path,
      }),
    ]));
  });
});
