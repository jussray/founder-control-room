import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoRulesets, mockCreateRepoRuleset, mockUpdateRepoRuleset } = vi.hoisted(() => ({
  mockGetRepoRulesets: vi.fn(),
  mockCreateRepoRuleset: vi.fn(),
  mockUpdateRepoRuleset: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = {
      getRepoRulesets: mockGetRepoRulesets,
      createRepoRuleset: mockCreateRepoRuleset,
      updateRepoRuleset: mockUpdateRepoRuleset,
    };
  },
}));

const { GitHubProvider } = await import("../GitHubProvider.js");

const PROJECT_ID = "founder-control-room";

function buildProvider() {
  return new GitHubProvider({
    token: "test-token",
    projectMap: { [PROJECT_ID]: "jussray/founder-control-room" },
  });
}

const baseConfig = {
  name: "protect-main",
  enforcement: "active" as const,
  targetRefs: ["main"],
  requirePullRequest: true,
  requiredApprovingReviewCount: 1,
  requiredStatusCheckNames: ["Typecheck", "Lint"],
  blockForcePushes: true,
  blockDeletion: true,
  bypassActors: [{ kind: "app" as const, id: "123456" }],
};

describe("GitHubProvider.applyBranchRuleset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepoRulesets.mockResolvedValue({ data: [] });
    mockCreateRepoRuleset.mockResolvedValue({
      data: { id: 1, name: "protect-main", enforcement: "active" },
    });
    mockUpdateRepoRuleset.mockResolvedValue({
      data: { id: 1, name: "protect-main", enforcement: "active" },
    });
  });

  it("creates a new ruleset with the requested rules and bypass actor when none exists", async () => {
    const provider = buildProvider();
    const result = await provider.applyBranchRuleset(PROJECT_ID, baseConfig);

    expect(mockGetRepoRulesets).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "jussray", repo: "founder-control-room" }),
    );
    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();

    const call = mockCreateRepoRuleset.mock.calls[0][0];
    expect(call.name).toBe("protect-main");
    expect(call.enforcement).toBe("active");
    expect(call.conditions.ref_name.include).toEqual(["refs/heads/main"]);

    // The app's own bypass entry must be present, or applying this ruleset
    // would break the app's own integrate() merge call (a direct write to
    // the protected branch, not a PR merge).
    expect(call.bypass_actors).toEqual([
      { actor_type: "Integration", actor_id: 123456, bypass_mode: "always" },
    ]);

    const ruleTypes = call.rules.map((rule: { type: string }) => rule.type);
    expect(ruleTypes).toEqual(
      expect.arrayContaining(["pull_request", "required_status_checks", "non_fast_forward", "deletion"]),
    );

    const pullRequestRule = call.rules.find((rule: { type: string }) => rule.type === "pull_request");
    expect(pullRequestRule.parameters.required_approving_review_count).toBe(1);

    const statusChecksRule = call.rules.find((rule: { type: string }) => rule.type === "required_status_checks");
    expect(statusChecksRule.parameters.required_status_checks).toEqual([
      { context: "Typecheck" },
      { context: "Lint" },
    ]);

    expect(result).toEqual({ id: "1", name: "protect-main", enforcement: "active" });
  });

  it("updates the existing ruleset by ID instead of creating a duplicate when a name match exists", async () => {
    mockGetRepoRulesets.mockResolvedValue({
      data: [{ id: 42, name: "protect-main" }, { id: 7, name: "unrelated-ruleset" }],
    });

    const provider = buildProvider();
    await provider.applyBranchRuleset(PROJECT_ID, baseConfig);

    expect(mockCreateRepoRuleset).not.toHaveBeenCalled();
    expect(mockUpdateRepoRuleset).toHaveBeenCalledTimes(1);
    expect(mockUpdateRepoRuleset.mock.calls[0][0].ruleset_id).toBe(42);
  });

  it("omits pull_request/status-check rules that were not requested", async () => {
    const provider = buildProvider();
    await provider.applyBranchRuleset(PROJECT_ID, {
      ...baseConfig,
      requirePullRequest: false,
      requiredStatusCheckNames: [],
      blockForcePushes: false,
      blockDeletion: false,
    });

    const call = mockCreateRepoRuleset.mock.calls[0][0];
    expect(call.rules).toEqual([]);
  });

  it("rejects an unknown bypass actor kind rather than silently dropping it", async () => {
    const provider = buildProvider();
    await expect(
      provider.applyBranchRuleset(PROJECT_ID, {
        ...baseConfig,
        // @ts-expect-error intentionally invalid kind to prove the runtime guard
        bypassActors: [{ kind: "team", id: "1" }],
      }),
    ).rejects.toThrow(/unsupported bypass actor kind/);
  });
});
