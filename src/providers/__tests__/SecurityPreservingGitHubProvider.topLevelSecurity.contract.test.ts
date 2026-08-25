import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("../SecurityPreservingGitHubProvider.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

describe("SecurityPreservingGitHubProvider top-level security contract", () => {
  it("preserves active enforcement and existing ref scope for an existing ruleset", () => {
    expect(source).toContain("mergeExistingRulesetEnforcement");
    expect(source).toContain("mergeExistingRulesetTargetRefs");
    expect(source).not.toContain("enforcement: config.enforcement,");
    expect(source).not.toContain("include: config.targetRefs.map");
  });

  it("does not let the narrow RulesetConfig bypass actor shape widen provider bypass authority", () => {
    expect(source).toContain("config.bypassActors && config.bypassActors.length > 0");
    expect(source).toContain("cannot replace existing bypass posture");
    expect(source).not.toContain('bypass_mode: "always" as const');
  });
});
