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
const projectsRoutePath = fileURLToPath(new URL("../../http/routes/projects.ts", import.meta.url));
const projectsRouteSource = readFileSync(projectsRoutePath, "utf8");

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
      ["main", "release"],
      ["refs/heads/main", "refs/heads/legacy"],
    )).toEqual(["refs/heads/main"]);
  });

  it("rejects bypass replacement and never PUT-updates an existing non-FCR ruleset", () => {
    expect(source).toContain("config.bypassActors && config.bypassActors.length > 0");
    expect(source).toContain("cannot replace existing bypass posture");
    expect(source).toContain("existing non-FCR ruleset updates are blocked until a concurrency-safe provider reconciliation contract exists");
    expect(source).not.toContain("repos.updateRepoRuleset");
  });

  it("keeps omitted bypassActors distinct from an explicit empty list at the request boundary", () => {
    expect(projectsRouteSource).toContain('const bypassActorsInput = body["bypassActors"];');
    expect(projectsRouteSource).toContain("...(bypassActors !== undefined ? { bypassActors } : {}),");
    expect(projectsRouteSource).not.toContain('Array.isArray(body["bypassActors"]) ? body["bypassActors"] : []');
  });
});
