import { describe, expect, it } from "vitest";
import {
  fingerprintRulesetReconciliationObservation,
  mergeExistingRulesetSecurity,
  planExistingRulesetReconciliation,
  type RulesetReconciliationObservation,
} from "../rulesetSecurityMerge.js";

describe("mergeExistingRulesetSecurity", () => {
  it("narrows required contexts without weakening existing provider security", () => {
    const existingRules = [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "required_linear_history" },
      { type: "pull_request", parameters: { required_approving_review_count: 2, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: true, required_review_thread_resolution: true, require_extra_approval_for_unattributed_changes: true } },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "Typecheck", integration_id: 15368 }, { context: "Verify live ProofMode MCP with Playwright", integration_id: 15368 }] } },
      { type: "code_scanning", parameters: { code_scanning_tools: [{ tool: "CodeQL", security_alerts_threshold: "high_or_higher", alerts_threshold: "errors_and_warnings" }] } },
      { type: "copilot_code_review", parameters: { review_on_push: false, review_draft_pull_requests: true } },
    ];
    const merged = mergeExistingRulesetSecurity({
      existingRules,
      requestedRules: [
        { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: false, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: true } },
        { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Typecheck" }, { context: "Unit Tests" }] } },
        { type: "non_fast_forward" },
        { type: "deletion" },
      ],
      requiredStatusCheckNames: ["Typecheck", "Unit Tests"],
      requirePullRequest: true,
      blockForcePushes: true,
      blockDeletion: true,
    });
    expect(merged.find((rule) => rule.type === "code_scanning")).toEqual(existingRules[5]);
    expect(merged.find((rule) => rule.type === "required_linear_history")).toEqual(existingRules[2]);
    expect(merged.find((rule) => rule.type === "copilot_code_review")).toEqual(existingRules[6]);
    expect(merged.find((rule) => rule.type === "pull_request")?.parameters).toMatchObject({ required_approving_review_count: 2, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: true, required_review_thread_resolution: true, require_extra_approval_for_unattributed_changes: true });
    expect(merged.find((rule) => rule.type === "required_status_checks")?.parameters?.["required_status_checks"]).toEqual([{ context: "Typecheck", integration_id: 15368 }, { context: "Unit Tests" }]);
  });

  it("preserves existing managed protections when a generic caller requests none", () => {
    const existingRules = [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "pull_request", parameters: { required_approving_review_count: 2, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: true, required_review_thread_resolution: true } }];
    const merged = mergeExistingRulesetSecurity({ existingRules, requestedRules: [], requiredStatusCheckNames: [], requirePullRequest: false, blockForcePushes: false, blockDeletion: false });
    expect(merged).toHaveLength(3);
    expect(merged.find((rule) => rule.type === "pull_request")?.parameters).toMatchObject({ required_approving_review_count: 2, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: true, required_review_thread_resolution: true });
  });

  it("does not mutate its input rules", () => {
    const existingRules = [{ type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true } }];
    const snapshot = structuredClone(existingRules);
    mergeExistingRulesetSecurity({ existingRules, requestedRules: [{ type: "pull_request", parameters: { required_approving_review_count: 1 } }], requiredStatusCheckNames: [], requirePullRequest: true, blockForcePushes: false, blockDeletion: false });
    expect(existingRules).toEqual(snapshot);
  });
});

function chiefGovernanceObservation(): RulesetReconciliationObservation {
  return {
    id: 21261587,
    versionId: 19,
    name: "governance boundary",
    enforcement: "active",
    targetRefs: ["~DEFAULT_BRANCH", "refs/heads/governance boundary"],
    excludedTargetRefs: [],
    bypassActors: [{ actor_type: "Integration", actor_id: 1236702, bypass_mode: "always" }],
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "required_linear_history" },
      { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_last_push_approval: true, required_review_thread_resolution: true } },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, required_status_checks: [
        { context: "Typecheck", integration_id: 15368 },
        { context: "Verify live ProofMode MCP with Playwright", integration_id: 15368 },
        { context: "Verify production ProofMode MCP with Playwright", integration_id: 15368 },
      ] } },
      { type: "code_scanning", parameters: { code_scanning_tools: [{ tool: "CodeQL", alerts_threshold: "errors_and_warnings" }] } },
    ],
  };
}

describe("planExistingRulesetReconciliation", () => {
  it("creates a version-fenced non-authorizing plan while preserving provider authority state", () => {
    const observation = chiefGovernanceObservation();
    const fingerprint = fingerprintRulesetReconciliationObservation(observation);
    const plan = planExistingRulesetReconciliation({
      observation,
      expectedRulesetId: "21261587",
      expectedVersionId: "19",
      expectedFingerprint: fingerprint,
      requestedRules: [
        { type: "pull_request", parameters: { required_approving_review_count: 1, required_review_thread_resolution: true } },
        { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [
          { context: "Typecheck", integration_id: 15368 },
          { context: "Verify candidate ProofMode runtime with Playwright", integration_id: 15368 },
        ] } },
      ],
      requiredStatusCheckNames: ["Typecheck", "Verify candidate ProofMode runtime with Playwright"],
      requirePullRequest: true,
      blockForcePushes: true,
      blockDeletion: true,
    });

    expect(plan.rulesetId).toBe("21261587");
    expect(plan.versionId).toBe("19");
    expect(plan.observedFingerprint).toBe(fingerprint);
    expect(plan.executionAuthorized).toBe(false);
    expect(plan.requiresFreshProviderReadback).toBe(true);
    expect(plan.desired.targetRefs).toEqual(observation.targetRefs);
    expect(plan.desired.excludedTargetRefs).toEqual(observation.excludedTargetRefs);
    expect(plan.desired.bypassActors).toEqual(observation.bypassActors);
    expect(plan.statusChecks).toEqual({
      added: ["Verify candidate ProofMode runtime with Playwright"],
      removed: ["Verify live ProofMode MCP with Playwright", "Verify production ProofMode MCP with Playwright"],
      retained: ["Typecheck"],
    });
    expect(plan.desired.rules.find((rule) => rule.type === "required_status_checks")?.parameters?.["required_status_checks"]).toEqual([
      { context: "Typecheck", integration_id: 15368 },
      { context: "Verify candidate ProofMode runtime with Playwright", integration_id: 15368 },
    ]);
    expect(plan.desired.rules.find((rule) => rule.type === "required_status_checks")?.parameters?.["strict_required_status_checks_policy"]).toBe(true);
    expect(plan.desired.rules.find((rule) => rule.type === "code_scanning")).toEqual(observation.rules[5]);
  });

  it("refuses a stale provider history version", () => {
    const observation = chiefGovernanceObservation();
    expect(() => planExistingRulesetReconciliation({
      observation,
      expectedRulesetId: "21261587",
      expectedVersionId: "18",
      expectedFingerprint: fingerprintRulesetReconciliationObservation(observation),
      requestedRules: [],
      requiredStatusCheckNames: ["Typecheck"],
      requirePullRequest: true,
      blockForcePushes: true,
      blockDeletion: true,
    })).toThrow("expected version 18, observed 19");
  });

  it("refuses same-version provider drift when the full state fingerprint changed", () => {
    const original = chiefGovernanceObservation();
    const expectedFingerprint = fingerprintRulesetReconciliationObservation(original);
    const drifted = chiefGovernanceObservation();
    drifted.bypassActors = [...drifted.bypassActors, { actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }];

    expect(() => planExistingRulesetReconciliation({
      observation: drifted,
      expectedRulesetId: "21261587",
      expectedVersionId: "19",
      expectedFingerprint,
      requestedRules: [],
      requiredStatusCheckNames: ["Typecheck"],
      requirePullRequest: true,
      blockForcePushes: true,
      blockDeletion: true,
    })).toThrow("observed provider fingerprint changed");
  });

  it("refuses duplicate required contexts", () => {
    const observation = chiefGovernanceObservation();
    expect(() => planExistingRulesetReconciliation({
      observation,
      expectedRulesetId: "21261587",
      expectedVersionId: "19",
      expectedFingerprint: fingerprintRulesetReconciliationObservation(observation),
      requestedRules: [],
      requiredStatusCheckNames: ["Typecheck", "Typecheck"],
      requirePullRequest: true,
      blockForcePushes: true,
      blockDeletion: true,
    })).toThrow("required status check names must be unique");
  });

  it("refuses an invalid requested check producer identity", () => {
    const observation = chiefGovernanceObservation();
    expect(() => planExistingRulesetReconciliation({
      observation,
      expectedRulesetId: "21261587",
      expectedVersionId: "19",
      expectedFingerprint: fingerprintRulesetReconciliationObservation(observation),
      requestedRules: [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "Verify candidate ProofMode runtime with Playwright", integration_id: 0 }] } }],
      requiredStatusCheckNames: ["Verify candidate ProofMode runtime with Playwright"],
      requirePullRequest: true,
      blockForcePushes: true,
      blockDeletion: true,
    })).toThrow("invalid integration_id for Verify candidate ProofMode runtime with Playwright");
  });

  it("does not mutate the provider observation or requested rules", () => {
    const observation = chiefGovernanceObservation();
    const requestedRules = [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Typecheck", integration_id: 15368 }] } }];
    const observationSnapshot = structuredClone(observation);
    const requestSnapshot = structuredClone(requestedRules);

    planExistingRulesetReconciliation({
      observation,
      expectedRulesetId: "21261587",
      expectedVersionId: "19",
      expectedFingerprint: fingerprintRulesetReconciliationObservation(observation),
      requestedRules,
      requiredStatusCheckNames: ["Typecheck"],
      requirePullRequest: true,
      blockForcePushes: true,
      blockDeletion: true,
    });

    expect(observation).toEqual(observationSnapshot);
    expect(requestedRules).toEqual(requestSnapshot);
  });
});
