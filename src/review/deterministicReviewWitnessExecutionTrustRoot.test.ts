import { readFileSync } from "node:fs";
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

  it("keeps the credential-bearing publisher on trusted default-branch dispatch only", () => {
    const workflow = readFileSync(
      new URL("../../.github/workflows/deterministic-review-core-advisory.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).toContain(
      "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'",
    );
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("EXPECTED_TRUSTED_MAIN_SHA: ${{ github.sha }}");
    expect(workflow).toContain("GITHUB_APP_ID: ${{ secrets.APP_ID }}");
    expect(workflow).toContain("GITHUB_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}");
    expect(workflow).not.toContain("secrets.GITHUB_APP_ID");
    expect(workflow).not.toContain("secrets.GITHUB_PRIVATE_KEY");
    expect(workflow).toContain("ref: ${{ env.EXPECTED_TRUSTED_MAIN_SHA }}");
    expect(workflow).toContain("test \"$GITHUB_REF\" = 'refs/heads/main'");
    expect(workflow).toContain("test \"$EXPECTED_TRUSTED_MAIN_SHA\" = \"$current_main\"");
    expect(workflow.match(/test \"\$EXPECTED_TRUSTED_MAIN_SHA\" = \"\$current_main\"/g)).toHaveLength(2);
    expect(workflow).toContain("node scripts/publish-deterministic-review-witness.mjs");
  });

  it("keeps caller selection narrow in the trusted runner", () => {
    const runner = readFileSync(
      new URL("../../scripts/publish-deterministic-review-witness.mjs", import.meta.url),
      "utf8",
    );

    expect(runner).toContain('const PROJECT_ID = "founder-control-room"');
    expect(runner).toContain('repo_identifier: "jussray/founder-control-room"');
    expect(runner).toContain('required("FCR_REVIEW_PR_NUMBER")');
    expect(runner).toContain('required("EXPECTED_TRUSTED_MAIN_SHA")');
    expect(runner).not.toContain("FCR_REVIEW_REPOSITORY");
    expect(runner).not.toContain("FCR_REVIEW_HEAD_SHA");
    expect(runner).not.toContain("FCR_REVIEW_VERDICT");
    expect(runner).not.toContain("FCR_REVIEWER_ID");
  });
});
