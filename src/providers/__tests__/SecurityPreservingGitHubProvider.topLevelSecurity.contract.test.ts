import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { requestedRefsRemainingExcluded } from "../SecurityPreservingGitHubProvider.js";

const sourcePath = fileURLToPath(new URL("../SecurityPreservingGitHubProvider.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");
const projectsRoutePath = fileURLToPath(new URL("../../http/routes/projects.ts", import.meta.url));
const projectsRouteSource = readFileSync(projectsRoutePath, "utf8");

describe("SecurityPreservingGitHubProvider top-level security contract", () => {
  it("fails closed only for exclusions whose coverage is locally provable", () => {
    expect(requestedRefsRemainingExcluded(["main"], ["refs/heads/main"])).toEqual(["refs/heads/main"]);
    expect(requestedRefsRemainingExcluded(["main"], ["~ALL"])).toEqual(["refs/heads/main"]);
    expect(requestedRefsRemainingExcluded(["main"], [])).toEqual([]);
  });

  it("does not invent GitHub ref-pattern or default-branch semantics locally", () => {
    expect(requestedRefsRemainingExcluded(["main"], ["refs/heads/*"])).toEqual([]);
    expect(requestedRefsRemainingExcluded(["release/v1"], ["refs/heads/release/*"])).toEqual([]);
    expect(requestedRefsRemainingExcluded(["release/v1"], ["~DEFAULT_BRANCH"])).toEqual([]);
  });

  it("keeps existing non-FCR mutation fail-closed", () => {
    expect(source).toContain("existing non-FCR ruleset updates are blocked until a concurrency-safe provider reconciliation contract exists");
    expect(source).not.toContain("this.adminOctokit.repos.updateRepoRuleset");
  });

  it("uses createRepoRuleset directly for a missing non-FCR ruleset", () => {
    expect(source).toContain("this.adminOctokit.repos.createRepoRuleset");
    expect(source).not.toContain("if (!existing) return super.applyBranchRuleset");
  });

  it("preserves FCR constitutional delegation and existing-ruleset bypass replacement refusal", () => {
    expect(source).toContain("projectId === FOUNDER_CONTROL_ROOM_PROJECT_ID");
    expect(source).toContain("return super.applyBranchRuleset(projectId, config)");
    expect(source).toContain("config.bypassActors && config.bypassActors.length > 0");
    expect(source).toContain("cannot replace existing bypass posture");
  });

  it("keeps omitted bypassActors absent from the founder ruleset request payload", () => {
    expect(projectsRouteSource).toContain('const bypassActorsInput = body["bypassActors"];');
    expect(projectsRouteSource).toContain("...(bypassActors !== undefined ? { bypassActors } : {}),");
    expect(projectsRouteSource).not.toContain('Array.isArray(body["bypassActors"]) ? body["bypassActors"] : []');
  });
});
