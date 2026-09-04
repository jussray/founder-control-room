import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhaseAwareRulesetConfig } from "../fcrGovernancePhase.js";

const {
  getRepoRulesets,
  getRepoRuleset,
  createRepoRuleset,
  updateRepoRuleset,
} = vi.hoisted(() => ({
  getRepoRulesets: vi.fn(),
  getRepoRuleset: vi.fn(),
  createRepoRuleset: vi.fn(),
  updateRepoRuleset: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = { getRepoRulesets, getRepoRuleset, createRepoRuleset, updateRepoRuleset };
  },
}));

const { FounderControlRoomGovernanceGitHubProvider } = await import("../FounderControlRoomGovernanceGitHubProvider.js");

const base: PhaseAwareRulesetConfig = {
  name: "Founder Control Room main exact-head gate",
  enforcement: "active",
  targetRefs: ["main"],
  requirePullRequest: true,
  governancePhase: "founder_only",
  requiredApprovingReviewCount: 0,
  requiredStatusCheckNames: ["Required Gate", "Verify test-ledger contract"],
  blockForcePushes: true,
  blockDeletion: true,
  bypassActors: [{ kind: "app", id: "123" }],
};

function reviewReadback(config: PhaseAwareRulesetConfig) {
  const independent = config.governancePhase === "independent_review";
  return {
    id: 11,
    name: config.name,
    enforcement: config.enforcement,
    bypass_actors: [{ actor_type: "Integration", actor_id: 123, bypass_mode: "pull_request" }],
    conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
    rules: [
      {
        type: "pull_request",
        parameters: {
          dismiss_stale_reviews_on_push: independent,
          require_code_owner_review: independent,
          require_last_push_approval: independent,
          required_approving_review_count: config.requiredApprovingReviewCount,
          required_review_thread_resolution: true,
        },
      },
      {
        type: "code_scanning",
        parameters: {
          code_scanning_tools: [{
            tool: "CodeQL",
            security_alerts_threshold: "high_or_higher",
            alerts_threshold: "errors",
          }],
        },
      },
      { type: "non_fast_forward" },
      { type: "deletion" },
    ],
  };
}

function freshnessReadback(config: PhaseAwareRulesetConfig) {
  return {
    id: 22,
    name: `${config.name} [strict freshness]`,
    enforcement: config.enforcement,
    bypass_actors: [],
    conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
    rules: [{
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: config.requiredStatusCheckNames.map((context) => ({ context })),
      },
    }],
  };
}

function installReadback(config: PhaseAwareRulesetConfig) {
  getRepoRulesets.mockResolvedValue({ data: [] });
  createRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string }) => ({
    data: payload.name.endsWith("[strict freshness]")
      ? { id: 22, name: payload.name, enforcement: payload.enforcement }
      : { id: 11, name: payload.name, enforcement: payload.enforcement },
  }));
  getRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
    data: ruleset_id === 22 ? freshnessReadback(config) : reviewReadback(config),
  }));
}

function provider() {
  return new FounderControlRoomGovernanceGitHubProvider({
    token: "test-token",
    projectMap: { "founder-control-room": "jussray/founder-control-room" },
  });
}

describe("FounderControlRoomGovernanceGitHubProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encodes founder_only as zero outside approvals while preserving machine/security protections", async () => {
    installReadback(base);
    const result = await provider().applyBranchRuleset("founder-control-room", base);

    expect(result.components?.map((entry) => entry.purpose)).toEqual(["review", "strict_freshness"]);
    const reviewPayload = createRepoRuleset.mock.calls.find((call) => call[0].name === base.name)?.[0];
    const params = reviewPayload.rules.find((rule: { type: string }) => rule.type === "pull_request").parameters;
    expect(params).toMatchObject({
      required_approving_review_count: 0,
      dismiss_stale_reviews_on_push: false,
      require_code_owner_review: false,
      require_last_push_approval: false,
      required_review_thread_resolution: true,
    });
    expect(reviewPayload.rules.some((rule: { type: string }) => rule.type === "code_scanning")).toBe(true);
    const freshnessPayload = createRepoRuleset.mock.calls.find((call) => call[0].name.endsWith("[strict freshness]"))?.[0];
    expect(freshnessPayload.bypass_actors).toEqual([]);
    expect(freshnessPayload.rules[0].parameters.strict_required_status_checks_policy).toBe(true);
  });

  it("encodes independent_review as the later outside-review phase without changing the machine floor", async () => {
    const config: PhaseAwareRulesetConfig = {
      ...base,
      governancePhase: "independent_review",
      requiredApprovingReviewCount: 1,
    };
    installReadback(config);
    await provider().applyBranchRuleset("founder-control-room", config);

    const reviewPayload = createRepoRuleset.mock.calls.find((call) => call[0].name === config.name)?.[0];
    expect(reviewPayload.rules.find((rule: { type: string }) => rule.type === "pull_request").parameters)
      .toMatchObject({
        required_approving_review_count: 1,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: true,
        require_last_push_approval: true,
        required_review_thread_resolution: true,
      });
  });

  it("rejects zero approvals unless founder_only is explicit before any provider mutation", async () => {
    await expect(provider().applyBranchRuleset("founder-control-room", {
      ...base,
      governancePhase: undefined,
      requiredApprovingReviewCount: 0,
    } as PhaseAwareRulesetConfig)).rejects.toThrow(/explicit governancePhase=founder_only/);
    expect(getRepoRulesets).not.toHaveBeenCalled();
    expect(createRepoRuleset).not.toHaveBeenCalled();
    expect(updateRepoRuleset).not.toHaveBeenCalled();
  });

  it("fails closed when provider readback silently reenables Code Owner review in founder_only", async () => {
    installReadback(base);
    getRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => {
      if (ruleset_id === 22) return { data: freshnessReadback(base) };
      const bad = reviewReadback(base);
      const pull = bad.rules.find((rule) => rule.type === "pull_request");
      if (pull) pull.parameters.require_code_owner_review = true;
      return { data: bad };
    });

    await expect(provider().applyBranchRuleset("founder-control-room", base))
      .rejects.toThrow(/Code Owner policy does not match requested phase/);
  });
});
