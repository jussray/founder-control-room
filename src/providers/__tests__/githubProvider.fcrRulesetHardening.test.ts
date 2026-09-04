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
  requiredApprovingReviewCount: 0,
  requiredStatusCheckNames: ["Required Gate", "Verify test-ledger contract"],
  blockForcePushes: true,
  blockDeletion: true,
  bypassActors: [{ kind: "app" as const, id: "123" }],
};

type TestConfig = typeof config;

function freshnessName(request: TestConfig = config) {
  return `${request.name} [strict freshness]`;
}

function reviewReadback(request: TestConfig = config) {
  const requireNativeHumanReview = request.requiredApprovingReviewCount > 0;
  const rules: Array<{ type: string; parameters?: Record<string, unknown> }> = [
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: request.requiredApprovingReviewCount,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: requireNativeHumanReview,
        require_last_push_approval: requireNativeHumanReview,
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
  ];
  if (request.blockForcePushes) rules.push({ type: "non_fast_forward" });
  if (request.blockDeletion) rules.push({ type: "deletion" });

  return {
    id: 1,
    name: request.name,
    enforcement: request.enforcement,
    bypass_actors: request.bypassActors.map((actor) => ({
      actor_type: "Integration",
      actor_id: Number(actor.id),
      bypass_mode: "pull_request",
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

function freshnessReadback(request: TestConfig = config) {
  return {
    id: 2,
    name: freshnessName(request),
    enforcement: request.enforcement,
    bypass_actors: [] as Array<{
      actor_type: string;
      actor_id: number;
      bypass_mode: string;
    }>,
    conditions: {
      ref_name: {
        include: request.targetRefs.map((ref) => `refs/heads/${ref}`),
        exclude: [],
      },
    },
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: request.requiredStatusCheckNames.map((context) => ({ context })),
        },
      },
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

function installStrongProviderMocks(request: TestConfig = config) {
  mockCreateRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string }) => ({
    data: {
      id: payload.name === freshnessName(request) ? 2 : 1,
      name: payload.name,
      enforcement: payload.enforcement,
    },
  }));
  mockUpdateRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string }) => ({
    data: {
      id: payload.name === freshnessName(request) ? 2 : 1,
      name: payload.name,
      enforcement: payload.enforcement,
    },
  }));
  mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
    data: ruleset_id === 2 ? freshnessReadback(request) : reviewReadback(request),
  }));
}

describe("GitHubProvider FCR main ruleset hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepoRulesets.mockResolvedValue({ data: [] });
    installStrongProviderMocks();
  });

  it("separates no-bypass strict freshness from the founder-only review membrane", async () => {
    const provider = buildProvider();
    const result = await provider.applyBranchRuleset("founder-control-room", config);

    expect(result.components).toEqual([
      { purpose: "review", id: "1", name: config.name, enforcement: "active" },
      { purpose: "strict_freshness", id: "2", name: freshnessName(), enforcement: "active" },
    ]);
    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(2);
    const freshnessPayload = mockCreateRepoRuleset.mock.calls[0]?.[0];
    const reviewPayload = mockCreateRepoRuleset.mock.calls[1]?.[0];

    expect(freshnessPayload.name).toBe(freshnessName());
    expect(freshnessPayload.bypass_actors).toEqual([]);
    expect(freshnessPayload.rules).toEqual([
      {
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: [
            { context: "Required Gate" },
            { context: "Verify test-ledger contract" },
          ],
          strict_required_status_checks_policy: true,
        },
      },
    ]);

    expect(reviewPayload.bypass_actors).toEqual([
      { actor_type: "Integration", actor_id: 123, bypass_mode: "pull_request" },
    ]);
    expect(reviewPayload.rules.some((rule: { type: string }) => rule.type === "required_status_checks")).toBe(false);
    expect(reviewPayload.rules.find((rule: { type: string }) => rule.type === "pull_request")?.parameters)
      .toMatchObject({
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: true,
      });
    expect(reviewPayload.rules.find((rule: { type: string }) => rule.type === "code_scanning")?.parameters)
      .toEqual({
        code_scanning_tools: [{
          tool: "CodeQL",
          security_alerts_threshold: "high_or_higher",
          alerts_threshold: "errors",
        }],
      });

    expect(mockGetRepoRuleset.mock.calls.map((call) => call[0].ruleset_id)).toEqual([2, 1]);
  });

  it("restores Code Owner and last-push review automatically in a future-team phase", async () => {
    const futureConfig = { ...config, requiredApprovingReviewCount: 1 };
    installStrongProviderMocks(futureConfig);

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", futureConfig)).resolves.toMatchObject({
      name: futureConfig.name,
      enforcement: "active",
    });

    const reviewPayload = mockCreateRepoRuleset.mock.calls.find((call) => call[0].name === futureConfig.name)?.[0];
    expect(reviewPayload.rules.find((rule: { type: string }) => rule.type === "pull_request")?.parameters)
      .toMatchObject({
        required_approving_review_count: 1,
        require_code_owner_review: true,
        require_last_push_approval: true,
      });
  });

  it("rejects invalid FCR main policy before any provider mutation", async () => {
    const provider = buildProvider();

    await expect(provider.applyBranchRuleset("founder-control-room", {
      ...config,
      requiredApprovingReviewCount: -1,
    })).rejects.toThrow("approving review count must be a non-negative integer");

    await expect(provider.applyBranchRuleset("founder-control-room", {
      ...config,
      requiredStatusCheckNames: [],
    })).rejects.toThrow("at least one required status check is required");

    expect(mockCreateRepoRuleset).not.toHaveBeenCalled();
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
    expect(mockGetRepoRuleset).not.toHaveBeenCalled();
  });

  it("rejects FCR main hardening without exactly one numeric GitHub App bypass identity", async () => {
    const provider = buildProvider();

    await expect(provider.applyBranchRuleset("founder-control-room", {
      ...config,
      bypassActors: [],
    })).rejects.toThrow("exactly one numeric GitHub App bypass actor is required");

    await expect(provider.applyBranchRuleset("founder-control-room", {
      ...config,
      bypassActors: [{ kind: "app", id: "not-numeric" }],
    })).rejects.toThrow("exactly one numeric GitHub App bypass actor is required");

    expect(mockCreateRepoRuleset).not.toHaveBeenCalled();
    expect(mockUpdateRepoRuleset).not.toHaveBeenCalled();
  });

  it("fails before touching the review membrane when freshness readback exposes a bypass actor", async () => {
    const compromised = freshnessReadback();
    compromised.bypass_actors = [{
      actor_type: "Integration",
      actor_id: 123,
      bypass_mode: "pull_request",
    }];
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? compromised : reviewReadback(),
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("strict freshness ruleset must have zero bypass actors");

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
    expect(mockCreateRepoRuleset.mock.calls[0]?.[0].name).toBe(freshnessName());
  });

  it("fails before touching the review membrane when freshness is not strict or exact", async () => {
    const weak = freshnessReadback();
    weak.rules = [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [{ context: "Required Gate" }],
        },
      },
    ];
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? weak : reviewReadback(),
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow(/FCR strict-freshness ruleset 2 read-back mismatch/);

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
  });

  it("fails closed when review readback widens the trusted app bypass", async () => {
    const widened = reviewReadback();
    widened.bypass_actors = [{
      actor_type: "Integration",
      actor_id: 123,
      bypass_mode: "always",
    }];
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? freshnessReadback() : widened,
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("bypass actors do not match the requested policy");
  });

  it("fails closed when founder-only readback unexpectedly requires Code Owner review", async () => {
    const weakened = reviewReadback();
    const pullRequestRule = weakened.rules.find((rule) => rule.type === "pull_request");
    if (!pullRequestRule?.parameters) throw new Error("test fixture missing pull_request parameters");
    pullRequestRule.parameters.require_code_owner_review = true;
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? freshnessReadback() : weakened,
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("Code Owner review requirement does not match the requested native-review phase");
  });

  it("fails closed when future-team readback drops Code Owner review", async () => {
    const futureConfig = { ...config, requiredApprovingReviewCount: 1 };
    const weakened = reviewReadback(futureConfig);
    const pullRequestRule = weakened.rules.find((rule) => rule.type === "pull_request");
    if (!pullRequestRule?.parameters) throw new Error("test fixture missing pull_request parameters");
    pullRequestRule.parameters.require_code_owner_review = false;
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? freshnessReadback(futureConfig) : weakened,
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", futureConfig))
      .rejects.toThrow("Code Owner review requirement does not match the requested native-review phase");
  });

  it("fails closed when review readback drops the CodeQL floor", async () => {
    const weakened = reviewReadback();
    weakened.rules = weakened.rules.filter((rule) => rule.type !== "code_scanning");
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? freshnessReadback() : weakened,
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("exactly one CodeQL code-scanning rule");
  });

  it("surfaces the verified freshness identity when the review mutation fails", async () => {
    mockCreateRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string }) => {
      if (payload.name === freshnessName()) {
        return { data: { id: 2, name: payload.name, enforcement: payload.enforcement } };
      }
      throw new Error("review write failed");
    });

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow(/strict-freshness ruleset .* \(2\).*review write failed/);

    expect(mockCreateRepoRuleset.mock.calls.map((call) => call[0].name))
      .toEqual([freshnessName(), config.name]);
  });

  it("updates both stable ruleset identities when they already exist", async () => {
    mockGetRepoRulesets.mockResolvedValue({
      data: [
        { id: 11, name: config.name },
        { id: 22, name: freshnessName() },
      ],
    });
    mockUpdateRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string; ruleset_id: number }) => ({
      data: {
        id: payload.ruleset_id,
        name: payload.name,
        enforcement: payload.enforcement,
      },
    }));
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 22 ? { ...freshnessReadback(), id: 22 } : { ...reviewReadback(), id: 11 },
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config)).resolves.toMatchObject({
      name: config.name,
      enforcement: "active",
    });

    expect(mockCreateRepoRuleset).not.toHaveBeenCalled();
    expect(mockUpdateRepoRuleset.mock.calls.map((call) => call[0].ruleset_id)).toEqual([22, 11]);
  });

  it("accepts renamed policy and additional protected refs when both membranes round-trip", async () => {
    const flexible = {
      ...config,
      name: "FCR main governance v2",
      targetRefs: ["main", "release"],
    };
    installStrongProviderMocks(flexible);

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", flexible)).resolves.toMatchObject({
      name: flexible.name,
      enforcement: "active",
    });
  });

  it("keeps generic repositories on their existing single-ruleset always-bypass behavior", async () => {
    const provider = buildProvider();
    await provider.applyBranchRuleset("sekret-bip", config);

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
    const payload = mockCreateRepoRuleset.mock.calls[0]?.[0];
    expect(payload.rules.find((rule: { type: string }) => rule.type === "pull_request")?.parameters)
      .toMatchObject({
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: true,
      });
    expect(payload.rules.find((rule: { type: string }) => rule.type === "code_scanning")).toBeUndefined();
    expect(payload.rules.find((rule: { type: string }) => rule.type === "required_status_checks")).toBeTruthy();
    expect(payload.bypass_actors).toEqual([
      { actor_type: "Integration", actor_id: 123, bypass_mode: "always" },
    ]);
    expect(mockGetRepoRuleset).not.toHaveBeenCalled();
  });
});
