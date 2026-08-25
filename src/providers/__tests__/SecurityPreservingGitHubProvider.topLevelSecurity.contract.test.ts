import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mergeExistingRulesetEnforcement,
  mergeExistingRulesetTargetRefs,
  requestedRefsRemainingExcluded,
} from "../SecurityPreservingGitHubProvider.js";

const sourcePath = fileURLToPath(new URL("../SecurityPreservingGitHubProvider.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

describe("SecurityPreservingGitHubProvider top-level security contract", () => {
  it("never demotes existing enforcement", () => {
    expect(mergeExistingRulesetEnforcement("active", "disabled")).toBe("active");
    expect(mergeExistingRulesetEnforcement("active", "evaluate")).toBe("active");
    expect(mergeExistingRulesetEnforcement("evaluate", "disabled")).toBe("evaluate");
    expect(mergeExistingRulesetEnforcement("disabled", "active")).toBe("active");
  });

  it("preserves existing branch scope and GitHub special ref selectors", () => {
    expect(mergeExistingRulesetTargetRefs(
      ["~DEFAULT_BRANCH", "~ALL", "refs/heads/release/*"],
      ["main", "refs/heads/release/*"],
    )).toEqual([
      "~DEFAULT_BRANCH",
      "~ALL",
      "refs/heads/release/*",
      "refs/heads/main",
    ]);
  });

  it("detects requested refs that remain explicitly excluded", () => {
    expect(requestedRefsRemainingExcluded(
      ["refs/heads/main", "refs/heads/legacy"],
      ["main", "release"],
    )).toEqual(["refs/heads/main"]);
    expect(requestedRefsRemainingExcluded([], ["main"])).toEqual([]);
  });

  it("does not let the narrow RulesetConfig bypass actor shape widen provider bypass authority", () => {
    expect(source).toContain("config.bypassActors && config.bypassActors.length > 0");
    expect(source).toContain("cannot replace existing bypass posture");
    expect(source).not.toContain('bypass_mode: "always" as const');
  });

  it("fails closed instead of performing a non-atomic existing-ruleset update", () => {
    expect(source).toContain("requested target refs remain excluded");
    expect(source).toContain("provider-supported atomic concurrency");
    expect(source).not.toContain("repos.updateRepoRuleset({");
  });
});
