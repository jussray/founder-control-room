import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoRulesets, mockGetRepoRuleset, mockUpdateRepoRuleset } = vi.hoisted(() => ({
  mockGetRepoRulesets: vi.fn(), mockGetRepoRuleset: vi.fn(), mockUpdateRepoRuleset: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = { getRepoRulesets: mockGetRepoRulesets, getRepoRuleset: mockGetRepoRuleset, updateRepoRuleset: mockUpdateRepoRuleset };
  },
}));

const { SecurityPreservingGitHubProvider } = await import("../SecurityPreservingGitHubProvider.js");
const PROJECT_ID = "chief-ai";
const provider = () => new SecurityPreservingGitHubProvider({ token: "test-token", projectMap: { [PROJECT_ID]: "jussray/chief-ai-machine" } });

describe("SecurityPreservingGitHubProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepoRulesets.mockResolvedValue({ data: [{ id: 21261587, name: "governance boundary" }] });
    mockGetRepoRuleset.mockResolvedValue({ data: {
      id: 21261587, name: "governance boundary", enforcement: "active", bypass_actors: [],
      rules: [
        { type: "deletion" }, { type: "non_fast_forward" }, { type: "required_linear_history" },
        { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: true, required_review_thread_resolution: true } },
        { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "Typecheck", integration_id: 15368 }, { context: "Legacy", integration_id: 15368 }] } },
        { type: "code_scanning", parameters: { code_scanning_tools: [{ tool: "CodeQL" }] } },
      ],
    } });
    mockUpdateRepoRuleset.mockResolvedValue({ data: { id: 21261587, name: "governance boundary", enforcement: "active" } });
  });

  it("updates an existing ruleset in place while preserving stronger security", async () => {
    const result = await provider().applyBranchRuleset(PROJECT_ID, {
      name: "governance boundary", enforcement: "active", targetRefs: ["main"], requirePullRequest: true,
      requiredApprovingReviewCount: 1, requiredStatusCheckNames: ["Typecheck", "Unit Tests"], blockForcePushes: true, blockDeletion: true,
    });
    const call = mockUpdateRepoRuleset.mock.calls[0][0];
    expect(call.ruleset_id).toBe(21261587);
    expect(call.rules.find((rule: { type: string }) => rule.type === "code_scanning")).toBeTruthy();
    expect(call.rules.find((rule: { type: string }) => rule.type === "required_linear_history")).toBeTruthy();
    expect(call.rules.find((rule: { type: string }) => rule.type === "required_status_checks").parameters.required_status_checks).toEqual([{ context: "Typecheck", integration_id: 15368 }, { context: "Unit Tests" }]);
    expect(result).toEqual({ id: "21261587", name: "governance boundary", enforcement: "active" });
  });

  it("preserves existing bypass posture when caller omits bypassActors", async () => {
    mockGetRepoRuleset.mockResolvedValueOnce({ data: { id: 21261587, name: "governance boundary", enforcement: "active", bypass_actors: [{ actor_type: "Integration", actor_id: 321, bypass_mode: "pull_request" }], rules: [] } });
    await provider().applyBranchRuleset(PROJECT_ID, { name: "governance boundary", enforcement: "active", targetRefs: ["main"], requirePullRequest: false, requiredApprovingReviewCount: 0, requiredStatusCheckNames: [], blockForcePushes: false, blockDeletion: false });
    expect(mockUpdateRepoRuleset.mock.calls[0][0].bypass_actors).toEqual([{ actor_type: "Integration", actor_id: 321, bypass_mode: "pull_request" }]);
  });

  it("clears existing bypass posture when caller explicitly supplies an empty list", async () => {
    mockGetRepoRuleset.mockResolvedValueOnce({ data: { id: 21261587, name: "governance boundary", enforcement: "active", bypass_actors: [{ actor_type: "Integration", actor_id: 321, bypass_mode: "pull_request" }], rules: [] } });
    await provider().applyBranchRuleset(PROJECT_ID, { name: "governance boundary", enforcement: "active", targetRefs: ["main"], requirePullRequest: false, requiredApprovingReviewCount: 0, requiredStatusCheckNames: [], blockForcePushes: false, blockDeletion: false, bypassActors: [] });
    expect(mockUpdateRepoRuleset.mock.calls[0][0].bypass_actors).toEqual([]);
  });
});
