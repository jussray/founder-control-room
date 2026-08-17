import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetRepoRulesets,
  mockGetRepoRuleset,
  mockListCollaborators,
  mockCreateRepoRuleset,
  mockUpdateRepoRuleset,
} = vi.hoisted(() => ({
  mockGetRepoRulesets: vi.fn(),
  mockGetRepoRuleset: vi.fn(),
  mockListCollaborators: vi.fn(),
  mockCreateRepoRuleset: vi.fn(),
  mockUpdateRepoRuleset: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = {
      getRepoRulesets: mockGetRepoRulesets,
      getRepoRuleset: mockGetRepoRuleset,
      listCollaborators: mockListCollaborators,
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

type TestConfig = typeof config & {
  bypassActors?: Array<{ kind: "app"; id: string }>;
};

function strongReadback(request: TestConfig = config) {
  const rules: Array<{ type: string; parameters?: Record<string, unknown> }> = [
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: request.requiredApprovingReviewCount,
        dismiss_stale_reviews_on_push: true,
        require_last_push_approval: true,
        required_review_thread_resolution: true,
      },
    },
  ];

  if (request.requiredStatusCheckNames.length > 0) {
    rules.push({
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: request.requiredStatusCheckNames.map((context) => ({ context })),
      },
    });
  }
  if (request.blockForcePushes) rules.push({ type: "non_fast_forward" });
  if (request.blockDeletion) rules.push({ type: "deletion" });

  return {
    id: 1,
    name: request.name,
    enforcement: request.enforcement,
    bypass_actors: (request.bypassActors ?? []).map((actor) => ({
      actor_type: "Integration",
      actor_id: Number(actor.id),
      bypass_mode: "always",
    })),
    conditions: {
      ref_name: {
        include: request.targetRefs.map((ref) => `refs/heads/${ref}`),
        exclude: [],
      },
    },
    rules,
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
    mockListCollaborators.mockResolvedValue({
      data: [
        { login: "jussray", permissions: { push: true } },
        { login: "independent-reviewer", permissions: { push: true } },
      ],
    });
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

    expect(mockListCollaborators).toHaveBeenCalledWith({
      owner: "jussray",
      repo: "founder-control-room",
      affiliation: "all",
      per_page: 100,
    });

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

    expect(mockListCollaborators).not.toHaveBeenCalled();
    expect(mockCreateRepoRuleset).not.toHaveBeenCalled();
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
    expect(mockGetRepoRuleset).not.toHaveBeenCalled();
  });

  it("rejects an independent-review policy when no non-owner writer can satisfy it", async () => {
    mockListCollaborators.mockResolvedValue({
      data: [{ login: "jussray", permissions: { push: true } }],
    });

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("non-owner collaborator with write authority");

    expect(mockCreateRepoRuleset).not.toHaveBeenCalled();
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
    expect(mockGetRepoRuleset).not.toHaveBeenCalled();
  });

  it("does not count a non-owner read-only collaborator as independent-review capability", async () => {
    mockListCollaborators.mockResolvedValue({
      data: [
        { login: "jussray", permissions: { push: true } },
        { login: "reader", permissions: { push: false } },
      ],
    });

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("non-owner collaborator with write authority");
  });

  it("accepts renamed policy and additional protected refs when semantics round-trip", async () => {
    const flexible = {
      ...config,
      name: "FCR main governance v2",
      targetRefs: ["main", "release"],
    };
    mockCreateRepoRuleset.mockResolvedValue({
      data: { id: 1, name: flexible.name, enforcement: "active" },
    });
    mockGetRepoRuleset.mockResolvedValue({ data: strongReadback(flexible) });

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", flexible)).resolves.toMatchObject({
      name: flexible.name,
      enforcement: "active",
    });
  });

  it("fails closed when provider read-back does not match the hardened FCR policy", async () => {
    const weak = strongReadback();
    weak.rules = [
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
    ];
    mockGetRepoRuleset.mockResolvedValue({ data: weak });

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("FCR main ruleset read-back mismatch");
  });

  it("fails closed when provider read-back widens bypass authority", async () => {
    const widened = strongReadback();
    widened.bypass_actors = [{
      actor_type: "Integration",
      actor_id: 999,
      bypass_mode: "always",
    }];
    mockGetRepoRuleset.mockResolvedValue({ data: widened });

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("bypass actors do not match the requested policy");
  });

  it("does not impose FCR-specific stale-review semantics on another project", async () => {
    const provider = buildProvider();
    await provider.applyBranchRuleset("sekret-bip", config);

    const pullRequestRule = pullRequestRuleFromLastCreate();
    expect(pullRequestRule.parameters.dismiss_stale_reviews_on_push).toBe(false);
    expect(pullRequestRule.parameters.require_last_push_approval).toBe(false);
    expect(pullRequestRule.parameters.required_review_thread_resolution).toBe(true);
    expect(mockListCollaborators).not.toHaveBeenCalled();
    expect(mockGetRepoRuleset).not.toHaveBeenCalled();
  });
});
