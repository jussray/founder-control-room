import { describe, expect, it } from "vitest";
import type { RulesetConfig } from "../RepositoryProvider.js";
import {
  assertFounderControlRoomTrustedBypassActor,
  assertRulesetGovernancePolicy,
  FOUNDER_CONTROL_ROOM_CANONICAL_RULESET_NAME,
  governanceProjectIdForRepository,
} from "../providerFactory.js";

const FCR_REPOSITORY = "jussray/founder-control-room";

const baseConfig: RulesetConfig = {
  name: "founder-control-room-main-exact-head-gate",
  enforcement: "active",
  targetRefs: ["main"],
  requirePullRequest: true,
  requiredApprovingReviewCount: 1,
  requiredStatusCheckNames: ["Playwright E2E", "Required Gate", "Verify test-ledger contract"],
  blockForcePushes: true,
  blockDeletion: true,
};

const canonicalConfig: RulesetConfig = {
  ...baseConfig,
  name: FOUNDER_CONTROL_ROOM_CANONICAL_RULESET_NAME,
};

describe("Founder Control Room ruleset governance", () => {
  it("accepts an active FCR main ruleset only when the constitutional floor is preserved", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", baseConfig)).not.toThrow();
  });

  it("binds FCR constitutional identity to repository identity instead of a mutable project slug", () => {
    expect(governanceProjectIdForRepository("fcr-alias", FCR_REPOSITORY)).toBe("founder-control-room");
    expect(() => assertRulesetGovernancePolicy(
      "fcr-alias",
      { ...canonicalConfig, enforcement: "disabled" },
      FCR_REPOSITORY,
    )).toThrow(/must remain actively enforced/);
  });

  it("does not canonicalize an alias for a different repository", () => {
    expect(governanceProjectIdForRepository("fcr-alias", "jussray/other-repo")).toBe("fcr-alias");
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

  it("fails closed when FCR main drops the Required Gate status check", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      requiredStatusCheckNames: ["Verify test-ledger contract"],
    })).toThrow(/Required Gate/);
  });

  it("fails closed when FCR main drops the exact-head ledger status check", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      requiredStatusCheckNames: ["Required Gate"],
    })).toThrow(/Verify test-ledger contract/);
  });

  it("fails closed when FCR main permits force pushes", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      blockForcePushes: false,
    })).toThrow(/block force pushes/);
  });

  it("fails closed when FCR main permits branch deletion", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      blockDeletion: false,
    })).toThrow(/block branch deletion/);
  });

  it("fails closed when the canonical FCR main ruleset is disabled", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...canonicalConfig,
      enforcement: "disabled",
    })).toThrow(/must remain actively enforced/);
  });

  it("fails closed when the canonical FCR main ruleset is demoted to evaluate mode", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...canonicalConfig,
      enforcement: "evaluate",
    })).toThrow(/must remain actively enforced/);
  });

  it("fails closed when the canonical FCR ruleset is retargeted away from main", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...canonicalConfig,
      targetRefs: ["release"],
    })).toThrow(/continue targeting main/);
  });

  it("requires the active FCR main ruleset bypass to match the configured GitHub App id exactly", () => {
    expect(() => assertFounderControlRoomTrustedBypassActor({
      ...canonicalConfig,
      bypassActors: [{ kind: "app", id: "123456" }],
    }, "123456")).not.toThrow();
  });

  it("fails closed when the trusted GitHub App id is unavailable", () => {
    expect(() => assertFounderControlRoomTrustedBypassActor({
      ...canonicalConfig,
      bypassActors: [{ kind: "app", id: "123456" }],
    }, undefined)).toThrow(/trusted GITHUB_APP_ID/);
  });

  it("rejects a caller-supplied bypass app that does not match trusted configuration", () => {
    expect(() => assertFounderControlRoomTrustedBypassActor({
      ...canonicalConfig,
      bypassActors: [{ kind: "app", id: "999999" }],
    }, "123456")).toThrow(/must exactly match/);
  });

  it("rejects additional FCR main bypass actors even when the trusted app is present", () => {
    expect(() => assertFounderControlRoomTrustedBypassActor({
      ...canonicalConfig,
      bypassActors: [
        { kind: "app", id: "123456" },
        { kind: "app", id: "999999" },
      ],
    }, "123456")).toThrow(/must exactly match/);
  });

  it("does not impose FCR's review floor on another project's policy", () => {
    expect(() => assertRulesetGovernancePolicy("sekret-bip", {
      ...baseConfig,
      requiredApprovingReviewCount: 0,
      requiredStatusCheckNames: [],
      blockForcePushes: false,
      blockDeletion: false,
    }, "jussray/Sekret-Bip")).not.toThrow();
  });

  it("allows FCR to evaluate a separately named proposed ruleset without mutating the canonical policy", () => {
    expect(() => assertRulesetGovernancePolicy("founder-control-room", {
      ...baseConfig,
      name: "FCR proposed governance experiment",
      enforcement: "evaluate",
      requirePullRequest: false,
      requiredApprovingReviewCount: 0,
      requiredStatusCheckNames: [],
      blockForcePushes: false,
      blockDeletion: false,
    }, FCR_REPOSITORY)).not.toThrow();
  });
});
