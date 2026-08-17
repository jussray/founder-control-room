import { describe, expect, it } from "vitest";
import type { RulesetConfig } from "../RepositoryProvider.js";
import { assertRulesetGovernancePolicy } from "../providerFactory.js";

const baseConfig: RulesetConfig = {
  name: "founder-control-room-main-exact-head-gate",
  enforcement: "active",
  targetRefs: ["main"],
  requirePullRequest: true,
  requiredApprovingReviewCount: 1,
  requiredStatusCheckNames: ["Playwright E2E", "Required Gate"],
  blockForcePushes: true,
  blockDeletion: true,
};

describe("Founder Control Room ruleset governance", () => {
  it("accepts an active FCR main ruleset only when PR review has at least one approval", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", baseConfig)).not.toThrow();
  });

  it("fails closed when FCR main requests zero approving reviews", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      requiredApprovingReviewCount: 0,
    })).toThrow(/at least one approving review/);
  });

  it("fails closed when FCR main disables pull-request enforcement", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      requirePullRequest: false,
    })).toThrow(/pull-request enforcement/);
  });

  it("fails closed on a non-integer FCR main review count", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      requiredApprovingReviewCount: Number.NaN,
    })).toThrow(/at least one approving review/);
  });

  it("does not impose FCR's review floor on another project's policy", () => {
    expect(() => assertRulesetGovernancePolicy("sekret-bip", {
      ...baseConfig,
      requiredApprovingReviewCount: 0,
    })).not.toThrow();
  });

  it("allows FCR to evaluate a proposed ruleset without activating the review floor", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      enforcement: "evaluate",
      requirePullRequest: false,
      requiredApprovingReviewCount: 0,
    })).not.toThrow();
  });
});
