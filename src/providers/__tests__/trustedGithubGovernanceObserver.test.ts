import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetRepoRuleset,
  mockGetGitHubInstallationToken,
  mockObserveGitHubRepositoryInstallation,
} = vi.hoisted(() => ({
  mockGetRepoRuleset: vi.fn(),
  mockGetGitHubInstallationToken: vi.fn(),
  mockObserveGitHubRepositoryInstallation: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = { getRepoRuleset: mockGetRepoRuleset };
  },
}));

vi.mock("../githubAppAuth.js", () => ({
  getGitHubInstallationToken: mockGetGitHubInstallationToken,
  observeGitHubRepositoryInstallation: mockObserveGitHubRepositoryInstallation,
}));

const {
  observeChiefCandidateProducerInstallationWithGitHubApp,
  observeChiefGovernanceWithGitHubApp,
  planChiefGovernanceWithGitHubApp,
} = await import("../trustedGithubGovernanceObserver.js");

const TEST_FCR_APP_ID = "900001";

function readback(
  id: number,
  name: string,
  checks: Array<Record<string, unknown>>,
  bypassActors: Array<Record<string, unknown>>,
  deployments: string[] = [],
) {
  const rules: Array<Record<string, unknown>> = [{
    type: "required_status_checks",
    parameters: { required_status_checks: checks },
  }];
  if (deployments.length > 0) {
    rules.push({
      type: "required_deployments",
      parameters: { required_deployment_environments: deployments },
    });
  }

  return {
    data: {
      id,
      name,
      target: "branch",
      enforcement: "active",
      bypass_actors: bypassActors,
      conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
      rules,
    },
  };
}

describe("trusted Chief governance GitHub App observer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGitHubInstallationToken.mockResolvedValue("installation-token");
    mockObserveGitHubRepositoryInstallation.mockResolvedValue({
      repository: "jussray/chief-ai-machine",
      appId: TEST_FCR_APP_ID,
      installationId: "7654321",
      repositorySelection: "selected",
      permissions: { checks: "write", contents: "read" },
    });
    mockGetRepoRuleset
      .mockResolvedValueOnce(readback(
        21261587,
        "governance boundary",
        [
          { context: "Verify operational authority", integration_id: 15368 },
          { context: "Verify live ProofMode MCP with Playwright", integration_id: 15368 },
          { context: "Verify production ProofMode MCP with Playwright", integration_id: 15368 },
        ],
        [{ actor_type: "Integration", actor_id: 85455, bypass_mode: "pull_request" }],
      ))
      .mockResolvedValueOnce(readback(
        20818149,
        "Chief AI main exact-head gate",
        [{ context: "Typecheck" }],
        [],
        ["Cloudflare Production", "proofmode-access-admin"],
      ));
  });

  it("mints a repository-scoped installation token instead of accepting caller token authority", async () => {
    const result = await observeChiefGovernanceWithGitHubApp({
      appId: TEST_FCR_APP_ID,
      privateKey: "test-private-key",
      now: new Date("2026-09-05T21:20:00.000Z"),
    });

    expect(mockGetGitHubInstallationToken).toHaveBeenCalledWith(
      TEST_FCR_APP_ID,
      "test-private-key",
      "jussray/chief-ai-machine",
    );
    expect(mockGetRepoRuleset).toHaveBeenNthCalledWith(1, {
      owner: "jussray",
      repo: "chief-ai-machine",
      ruleset_id: 21261587,
    });
    expect(mockGetRepoRuleset).toHaveBeenNthCalledWith(2, {
      owner: "jussray",
      repo: "chief-ai-machine",
      ruleset_id: 20818149,
    });
    expect(result.governanceBoundary.observer).toEqual({ kind: "github-app", appId: TEST_FCR_APP_ID });
    expect(result.exactHeadGate.observer).toEqual({ kind: "github-app", appId: TEST_FCR_APP_ID });
    expect(result.exactHeadGate.authority.providerMutationAuthority).toBe(false);
  });

  it("observes fixed-repository Check Run capability without granting publication authority", async () => {
    const result = await observeChiefCandidateProducerInstallationWithGitHubApp({
      appId: TEST_FCR_APP_ID,
      privateKey: "test-private-key",
      now: new Date("2026-09-05T22:50:00.000Z"),
    });

    expect(mockObserveGitHubRepositoryInstallation).toHaveBeenCalledWith(
      TEST_FCR_APP_ID,
      "test-private-key",
      "jussray/chief-ai-machine",
    );
    expect(result).toMatchObject({
      repository: "jussray/chief-ai-machine",
      appId: TEST_FCR_APP_ID,
      installationId: "7654321",
      checksPermission: "write",
      checksWriteAvailable: true,
      observedAt: "2026-09-05T22:50:00.000Z",
      authority: {
        candidateCheckPublicationAuthority: false,
        providerMutationAuthority: false,
      },
    });
  });

  it("reports missing Check Run write authority without upgrading capability", async () => {
    mockObserveGitHubRepositoryInstallation.mockResolvedValueOnce({
      repository: "jussray/chief-ai-machine",
      appId: TEST_FCR_APP_ID,
      installationId: "7654321",
      repositorySelection: "selected",
      permissions: { checks: "read", contents: "read" },
    });

    const result = await observeChiefCandidateProducerInstallationWithGitHubApp({
      appId: TEST_FCR_APP_ID,
      privateKey: "test-private-key",
    });

    expect(result.checksPermission).toBe("read");
    expect(result.checksWriteAvailable).toBe(false);
    expect(result.authority.candidateCheckPublicationAuthority).toBe(false);
  });

  it("verifies the founder-approved ruleset as-is while the external candidate producer remains unbound", async () => {
    const result = await planChiefGovernanceWithGitHubApp({
      appId: TEST_FCR_APP_ID,
      privateKey: "test-private-key",
      now: new Date("2026-09-05T21:20:00.000Z"),
    });

    expect(result.disposition).toBe("NO_CHANGE_REQUIRED");
    expect(result.changesRequired).toBe(false);
    expect(result.mutationRequired).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.candidateProducer).toMatchObject({
      integrationId: null,
      requiredByRuleset: false,
    });
    expect(result.observedRequiredDeploymentEnvironments.exactHeadGate).toEqual([
      "Cloudflare Production",
      "proofmode-access-admin",
    ]);
  });

  it("fails closed before token minting when App identity is malformed", async () => {
    await expect(observeChiefGovernanceWithGitHubApp({
      appId: "not-an-app",
      privateKey: "test-private-key",
    })).rejects.toThrow(/numeric GitHub App id/);
    expect(mockGetGitHubInstallationToken).not.toHaveBeenCalled();
  });

  it("fails closed before provider access when the private key is empty", async () => {
    await expect(observeChiefGovernanceWithGitHubApp({
      appId: TEST_FCR_APP_ID,
      privateKey: "  ",
    })).rejects.toThrow(/requires a GitHub App private key/);
    expect(mockGetGitHubInstallationToken).not.toHaveBeenCalled();
  });
});
