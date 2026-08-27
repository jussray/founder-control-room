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
  name: "protect-main",
  targetRefs: ["main"],
  enforcement: "active" as const,
  requirePullRequest: true,
  requiredApprovingReviewCount: 1,
  requiredStatusCheckNames: ["Required Gate"],
  blockForcePushes: true,
  blockDeletion: true,
  bypassActors: [{ kind: "app" as const, id: "123" }],
};

function freshnessReadback() {
  return {
    id: 2,
    name: "protect-main [strict freshness]",
    enforcement: "active",
    bypass_actors: [],
    conditions: {
      ref_name: {
        include: ["refs/heads/main"],
        exclude: [],
      },
    },
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [{ context: "Required Gate" }],
        },
      },
    ],
  };
}

function mismatchedReviewReadback() {
  return {
    id: 1,
    name: "protect-main",
    enforcement: "active",
    bypass_actors: [
      {
        actor_type: "Integration",
        actor_id: 123,
        bypass_mode: "always",
      },
    ],
    conditions: {
      ref_name: {
        include: ["refs/heads/main"],
        exclude: [],
      },
    },
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
    },
  });
}

describe("GitHubProvider FCR composite ruleset partial-failure receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepoRulesets.mockResolvedValue({ data: [] });
    mockCreateRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string }) => ({
      data: {
        id: payload.name.endsWith("[strict freshness]") ? 2 : 1,
        name: payload.name,
        enforcement: payload.enforcement,
      },
    }));
    mockUpdateRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string }) => ({
      data: {
        id: payload.name.endsWith("[strict freshness]") ? 2 : 1,
        name: payload.name,
        enforcement: payload.enforcement,
      },
    }));
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? freshnessReadback() : mismatchedReviewReadback(),
    }));
  });

  it("retains both mutated component identities when review readback fails", async () => {
    const provider = buildProvider();

    await expect(provider.applyBranchRuleset("founder-control-room", config)).rejects.toThrow(
      /verified strict-freshness ruleset protect-main \[strict freshness\] \(2\); mutated review ruleset protect-main \(1\) also requires reconciliation: .*bypass actors do not match/,
    );

    expect(mockCreateRepoRuleset.mock.calls.map((call) => call[0].name)).toEqual([
      "protect-main [strict freshness]",
      "protect-main",
    ]);
    expect(mockGetRepoRuleset.mock.calls.map((call) => call[0].ruleset_id)).toEqual([2, 1]);
    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(2);
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("does not claim a review mutation when the review write itself fails", async () => {
    mockCreateRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string }) => {
      if (payload.name.endsWith("[strict freshness]")) {
        return {
          data: { id: 2, name: payload.name, enforcement: payload.enforcement },
        };
      }
      throw new Error("review write failed before provider identity returned");
    });

    const provider = buildProvider();
    let thrown: unknown;
    try {
      await provider.applyBranchRuleset("founder-control-room", config);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/verified strict-freshness ruleset protect-main \[strict freshness\] \(2\)/);
    expect((thrown as Error).message).toContain("review write failed before provider identity returned");
    expect((thrown as Error).message).not.toContain("mutated review ruleset");
    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(2);
    expect(mockGetRepoRuleset).toHaveBeenCalledTimes(1);
  });
});
