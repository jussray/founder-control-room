import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetRepoRulesets,
  mockGetRepoRuleset,
  mockCreateRepoRuleset,
  mockUpdateRepoRuleset,
} = vi.hoisted(() => ({
  mockGetRepoRulesets: vi.fn(),
  mockGetRepoRuleset: vi.fn(),
  mockCreateRepoRuleset: vi.fn(),
  mockUpdateRepoRuleset: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = {
      getRepoRulesets: mockGetRepoRulesets,
      getRepoRuleset: mockGetRepoRuleset,
      createRepoRuleset: mockCreateRepoRuleset,
      updateRepoRuleset: mockUpdateRepoRuleset,
    };
  },
}));

const { GitHubProvider } = await import("../GitHubProvider.js");

const config = {
  name: "Founder Control Room main exact-head gate",
  enforcement: "active" as const,
  targetRefs: ["main"],
  requirePullRequest: true,
  requiredApprovingReviewCount: 1,
  requiredStatusCheckNames: ["Required Gate", "Verify test-ledger contract"],
  blockForcePushes: true,
  blockDeletion: true,
};

function strongReadback() {
  return {
    id: 1,
    name: config.name,
    enforcement: "active",
    rules: [
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 1,
          dismiss_stale_reviews_on_push: true,
          require_last_push_approval: true,
          required_review_thread_resolution: true,
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: "Required Gate" },
            { context: "Verify test-ledger contract" },
          ],
        },
      },
      { type: "non_fast_forward" },
      { type: "deletion" },
    ],
  };
}

function buildProvider() {
  return new GitHubProvider({
    token: "test-token",
    projectMap: {
      "founder-control-room": "jussray/founder-control-room",
      "sekret-bip": "jussray/Sekret-Bip",
    },
  });
}

function pullRequestRuleFromLastCreate() {
  const payload = mockCreateRepoRuleset.mock.calls.at(-1)?.[0];
  return payload.rules.find((rule: { type: string }) => rule.type === "pull_request");
}

function statusRuleFromLastCreate() {
  const payload = mockCreateRepoRuleset.mock.calls.at(-1)?.[0];
  return payload.rules.find((rule: { type: string }) => rule.type === "required_status_checks");
}

describe("GitHubProvider FCR main ruleset hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepoRulesets.mockResolvedValue({ data: [] });
    mockGetRepoRuleset.mockResolvedValue({ data: strongReadback() });
    mockCreateRepoRuleset.mockResolvedValue({
      data: { id: 1, name: config.name, enforcement: "active" },
    });
    mockUpdateRepoRuleset.mockResolvedValue({
      data: { id: 1, name: config.name, enforcement: "active" },
    });
  });

  it("maps active FCR main review policy to stale-review and last-push protections", async () => {
    const provider = buildProvider();
    await provider.applyBranchRuleset("founder-control-room", config);

    const pullRequestRule = pullRequestRuleFromLastCreate();
    expect(pullRequestRule.parameters).toMatchObject({
      required_approving_review_count: 1,
      dismiss_stale_reviews_on_push: true,
      require_last_push_approval: true,
      required_review_thread_resolution: true,
    });

    const statusRule = statusRuleFromLastCreate();
    expect(statusRule.parameters.strict_required_status_checks_policy).toBe(true);
    expect(statusRule.parameters.required_status_checks).toEqual([
      { context: "Required Gate" },
      { context: "Verify test-ledger contract" },
    ]);
    expect(mockGetRepoRuleset).toHaveBeenCalledWith({
      owner: "jussray",
      repo: "founder-control-room",
      ruleset_id: 1,
    });
  });

  it("rejects a weak FCR main policy before provider mutation", async () => {
    const provider = buildProvider();

    await expect(provider.applyBranchRuleset("founder-control-room", {
      ...config,
      requiredApprovingReviewCount: 0,
    })).rejects.toThrow("at least one approving review is required");

    expect(mockCreateRepoRuleset).not.toHaveBeenCalled();
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
    expect(mockGetRepoRuleset).not.toHaveBeenCalled();
  });

  it("fails closed when provider read-back does not match the hardened FCR policy", async () => {
    mockGetRepoRuleset.mockResolvedValue({
      data: {
        ...strongReadback(),
        rules: [
          {
            type: "pull_request",
            parameters: {
              required_approving_review_count: 0,
              dismiss_stale_reviews_on_push: false,
              require_last_push_approval: false,
              required_review_thread_resolution: false,
            },
          },
          {
            type: "required_status_checks",
            parameters: {
              strict_required_status_checks_policy: false,
              required_status_checks: [{ context: "Required Gate" }],
            },
          },
        ],
      },
    });

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("FCR main ruleset read-back mismatch");
  });

  it("does not impose FCR-specific stale-review semantics on another project", async () => {
    const provider = buildProvider();
    await provider.applyBranchRuleset("sekret-bip", config);

    const pullRequestRule = pullRequestRuleFromLastCreate();
    expect(pullRequestRule.parameters.dismiss_stale_reviews_on_push).toBe(false);
    expect(pullRequestRule.parameters.require_last_push_approval).toBe(false);
    expect(pullRequestRule.parameters.required_review_thread_resolution).toBe(true);
    expect(mockGetRepoRuleset).not.toHaveBeenCalled();
  });
});
