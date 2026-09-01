import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoRulesets, mockGetRepoRuleset, mockUpdateRepoRuleset, mockCreateRepoRuleset } = vi.hoisted(() => ({
  mockGetRepoRulesets: vi.fn(),
  mockGetRepoRuleset: vi.fn(),
  mockUpdateRepoRuleset: vi.fn(),
  mockCreateRepoRuleset: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = {
      getRepoRulesets: mockGetRepoRulesets,
      getRepoRuleset: mockGetRepoRuleset,
      updateRepoRuleset: mockUpdateRepoRuleset,
      createRepoRuleset: mockCreateRepoRuleset,
    };
  },
}));

const { SecurityPreservingGitHubProvider } = await import("../SecurityPreservingGitHubProvider.js");
const PROJECT_ID = "chief-ai";
const provider = () => new SecurityPreservingGitHubProvider({
  token: "test-token",
  projectMap: { [PROJECT_ID]: "jussray/chief-ai-machine" },
});

const config = (overrides: Record<string, unknown> = {}) => ({
  name: "governance boundary",
  enforcement: "active" as const,
  targetRefs: ["main"],
  requirePullRequest: true,
  requiredApprovingReviewCount: 1,
  requiredStatusCheckNames: ["Typecheck", "Unit Tests"],
  blockForcePushes: true,
  blockDeletion: true,
  ...overrides,
});

describe("SecurityPreservingGitHubProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepoRulesets.mockResolvedValue({ data: [{ id: 21261587, name: "governance boundary" }] });
    mockGetRepoRuleset.mockResolvedValue({ data: {
      id: 21261587,
      name: "governance boundary",
      enforcement: "active",
      bypass_actors: [],
      conditions: { ref_name: { include: ["~ALL"], exclude: [] } },
      rules: [],
    } });
    mockCreateRepoRuleset.mockResolvedValue({ data: {
      id: 30000001,
      name: "governance boundary",
      enforcement: "active",
    } });
  });

  it("fails closed instead of PUT-updating an existing non-FCR ruleset from a stale provider snapshot", async () => {
    await expect(provider().applyBranchRuleset(PROJECT_ID, config())).rejects.toThrow(
      "existing non-FCR ruleset updates are blocked until a concurrency-safe provider reconciliation contract exists",
    );
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
    expect(mockCreateRepoRuleset).not.toHaveBeenCalled();
  });

  it("diagnoses an exact requested ref exclusion without any provider mutation", async () => {
    mockGetRepoRuleset.mockResolvedValueOnce({ data: {
      id: 21261587,
      name: "governance boundary",
      enforcement: "active",
      bypass_actors: [],
      conditions: { ref_name: { include: ["~ALL"], exclude: ["refs/heads/main"] } },
      rules: [],
    } });

    await expect(provider().applyBranchRuleset(PROJECT_ID, config())).rejects.toThrow(
      "requested target refs remain explicitly excluded by the existing ruleset: refs/heads/main",
    );
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("diagnoses ~ALL as excluding every requested target", async () => {
    mockGetRepoRuleset.mockResolvedValueOnce({ data: {
      id: 21261587,
      name: "governance boundary",
      enforcement: "active",
      bypass_actors: [],
      conditions: { ref_name: { include: ["~ALL"], exclude: ["~ALL"] } },
      rules: [],
    } });

    await expect(provider().applyBranchRuleset(
      PROJECT_ID,
      config({ targetRefs: ["main", "release/v1"] }),
    )).rejects.toThrow(
      "requested target refs remain explicitly excluded by the existing ruleset: refs/heads/main, refs/heads/release/v1",
    );
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("does not invent ~DEFAULT_BRANCH coverage for a non-default requested ref", async () => {
    mockGetRepoRuleset.mockResolvedValueOnce({ data: {
      id: 21261587,
      name: "governance boundary",
      enforcement: "active",
      bypass_actors: [],
      conditions: { ref_name: { include: ["~ALL"], exclude: ["~DEFAULT_BRANCH"] } },
      rules: [],
    } });

    await expect(provider().applyBranchRuleset(
      PROJECT_ID,
      config({ targetRefs: ["release/v1"] }),
    )).rejects.toThrow(
      "existing non-FCR ruleset updates are blocked until a concurrency-safe provider reconciliation contract exists",
    );
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("does not approximate GitHub wildcard or character-class selectors locally", async () => {
    for (const exclusion of ["refs/heads/release/*", "refs/heads/release/?", "refs/heads/release/[0-9]"] as const) {
      mockGetRepoRuleset.mockResolvedValueOnce({ data: {
        id: 21261587,
        name: "governance boundary",
        enforcement: "active",
        bypass_actors: [],
        conditions: { ref_name: { include: ["~ALL"], exclude: [exclusion] } },
        rules: [],
      } });

      await expect(provider().applyBranchRuleset(
        PROJECT_ID,
        config({ targetRefs: ["release/1"] }),
      )).rejects.toThrow(
        "existing non-FCR ruleset updates are blocked until a concurrency-safe provider reconciliation contract exists",
      );
    }
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("keeps explicit bypass replacement fail-closed before any existing-ruleset mutation", async () => {
    mockGetRepoRuleset.mockResolvedValueOnce({ data: {
      id: 21261587,
      name: "governance boundary",
      enforcement: "active",
      bypass_actors: [{ actor_type: "Integration", actor_id: 321, bypass_mode: "pull_request" }],
      conditions: { ref_name: { include: ["~ALL"], exclude: [] } },
      rules: [],
    } });

    await expect(provider().applyBranchRuleset(
      PROJECT_ID,
      config({ bypassActors: [{ kind: "app", id: "321" }] }),
    )).rejects.toThrow("cannot replace existing bypass posture");
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("uses a direct create-only provider call when the named ruleset does not exist", async () => {
    mockGetRepoRulesets.mockResolvedValueOnce({ data: [] });

    await expect(provider().applyBranchRuleset(PROJECT_ID, config())).resolves.toEqual({
      id: "30000001",
      name: "governance boundary",
      enforcement: "active",
    });

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
    expect(mockCreateRepoRuleset.mock.calls[0][0]).toMatchObject({
      owner: "jussray",
      repo: "chief-ai-machine",
      name: "governance boundary",
      target: "branch",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
    });
  });

  it("propagates a concurrent create conflict without falling back to PUT", async () => {
    mockGetRepoRulesets.mockResolvedValueOnce({ data: [] });
    mockCreateRepoRuleset.mockRejectedValueOnce(new Error("422 ruleset name already exists"));

    await expect(provider().applyBranchRuleset(PROJECT_ID, config())).rejects.toThrow(
      "422 ruleset name already exists",
    );
    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });
});
