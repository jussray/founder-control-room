import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mergeExistingRulesetEnforcement,
  mergeExistingRulesetTargetRefs,
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

  it("distinguishes omitted bypass posture from an explicit clear while rejecting replacement", () => {
    expect(source).toContain("config.bypassActors && config.bypassActors.length > 0");
    expect(source).toContain("cannot replace existing bypass posture");
    expect(source).toContain("config.bypassActors === undefined");
    expect(source).toContain("current.bypass_actors ?? []");
    expect(source).not.toContain('bypass_mode: "always" as const');
  });

  it("keeps omitted bypassActors absent from the founder ruleset request payload", () => {
    expect(projectsRouteSource).toContain('const bypassActorsInput = body["bypassActors"];');
    expect(projectsRouteSource).toContain("...(bypassActors !== undefined ? { bypassActors } : {}),");
    expect(projectsRouteSource).not.toContain('Array.isArray(body["bypassActors"]) ? body["bypassActors"] : []');
  });
});
