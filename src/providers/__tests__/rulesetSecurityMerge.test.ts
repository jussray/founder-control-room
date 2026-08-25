import { describe, expect, it } from "vitest";
import { mergeExistingRulesetSecurity } from "../rulesetSecurityMerge.js";

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
