import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoRulesets, mockGetRepoRuleset, mockUpdateRepoRuleset, mockCreateRepoRuleset } = vi.hoisted(() => ({
  mockGetRepoRulesets: vi.fn(), mockGetRepoRuleset: vi.fn(), mockUpdateRepoRuleset: vi.fn(), mockCreateRepoRuleset: vi.fn(),
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
const provider = () => new SecurityPreservingGitHubProvider({ token: "test-token", projectMap: { [PROJECT_ID]: "jussray/chief-ai-machine" } });

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
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        { type: "required_linear_history" },
        { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: true, required_review_thread_resolution: true } },
        { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "Typecheck", integration_id: 15368 }, { context: "Legacy", integration_id: 15368 }] } },
        { type: "code_scanning", parameters: { code_scanning_tools: [{ tool: "CodeQL" }] } },
      ],
    } });
    mockCreateRepoRuleset.mockResolvedValue({ data: { id: 31337, name: "governance boundary", enforcement: "active" } });
  });

  it("fails closed instead of PUT-updating an existing non-FCR ruleset from a stale provider snapshot", async () => {
    await expect(provider().applyBranchRuleset(PROJECT_ID, config())).rejects.toThrow(
      "existing non-FCR ruleset updates are blocked until a concurrency-safe provider reconciliation contract exists",
    );
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("rejects a requested protected ref that remains explicitly excluded", async () => {
    mockGetRepoRuleset.mockResolvedValueOnce({ data: {
      id: 21261587,
      name: "governance boundary",
      enforcement: "active",
      bypass_actors: [],
      conditions: { ref_name: { include: ["~ALL"], exclude: ["refs/heads/main"] } },
      rules: [],
    } });

    await expect(provider().applyBranchRuleset(PROJECT_ID, config())).rejects.toThrow(
      "requested target refs remain excluded by the existing ruleset: refs/heads/main",
    );
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

    await expect(provider().applyBranchRuleset(PROJECT_ID, config({ bypassActors: [{ kind: "app", id: "321" }] }))).rejects.toThrow(
      "cannot replace existing bypass posture",
    );
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("creates a brand-new non-FCR ruleset without delegating to an update-capable path", async () => {
    mockGetRepoRulesets.mockResolvedValueOnce({ data: [] });

    await expect(provider().applyBranchRuleset(PROJECT_ID, config())).resolves.toEqual({
      id: "31337",
      name: "governance boundary",
      enforcement: "active",
    });

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("fails closed when a create-only race produces a provider conflict and never falls back to PUT", async () => {
    mockGetRepoRulesets.mockResolvedValueOnce({ data: [] });
    mockCreateRepoRuleset.mockRejectedValueOnce(new Error("Validation Failed: name already exists"));

    await expect(provider().applyBranchRuleset(PROJECT_ID, config())).rejects.toThrow(
      "create-only ruleset creation failed; refusing update fallback",
    );

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });
});
