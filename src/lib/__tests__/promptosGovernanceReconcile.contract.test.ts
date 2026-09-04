import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/promptos-governance-reconcile.yml",
  "utf8",
);

describe("PromptOS governance reconciler contract", () => {
  it("requires the immutable founder command identity and production environment", () => {
    expect(workflow).toContain("github.event.issue.number == 418");
    expect(workflow).toContain("github.event.comment.user.id == 286642846");
    expect(workflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("/reconcile-promptos-governance");
  });

  it("binds the provider mutation to exact FCR main and exact PromptOS main", () => {
    expect(workflow).toContain("EXPECTED_FCR_MAIN_SHA");
    expect(workflow).toContain("EXPECTED_PROMPTOS_MAIN_SHA");
    expect(workflow).toContain("test \"$actual\" = \"$EXPECTED_FCR_MAIN_SHA\"");
    expect(workflow).toContain("PromptOS main moved before governance reconciliation");
    expect(workflow).toContain("PromptOS main moved during governance reconciliation");
    expect(workflow).toContain("Re-read both mutable main refs after provider mutation");
  });

  it("uses the canonical provider seam and founder-only zero-bypass policy", () => {
    expect(workflow).toContain("providerForProject(PROJECT)");
    expect(workflow).toContain("provider.applyBranchRuleset(PROJECT_ID");
    expect(workflow).toContain("repo_identifier: REPOSITORY");
    expect(workflow).toContain("const REPOSITORY = 'jussray/promptos'");
    expect(workflow).toContain("requiredApprovingReviewCount: 0");
    expect(workflow).toContain("bypassActors: []");
  });

  it("requires strict exact-head PromptOS control-room evidence and CodeQL", () => {
    expect(workflow).toContain("'Verify PromptOS control room tests'");
    expect(workflow).toContain("'CodeQL'");
    expect(workflow).toContain("strict_required_status_checks_policy === true");
    expect(workflow).toContain("required_review_thread_resolution === true");
    expect(workflow).toContain("ruleTypes.has('deletion')");
    expect(workflow).toContain("ruleTypes.has('non_fast_forward')");
    expect(workflow).toContain("bypassActors.length === 0");
  });

  it("publishes a fail-closed receipt that grants no downstream authority", () => {
    expect(workflow).toContain("fcr/promptos-governance-reconcile@v1");
    expect(workflow).toContain("providerMutationState");
    expect(workflow).toContain("authorizesMerge: false");
    expect(workflow).toContain("authorizesBypass: false");
    expect(workflow).toContain("authorizesDeployment: false");
  });
});
