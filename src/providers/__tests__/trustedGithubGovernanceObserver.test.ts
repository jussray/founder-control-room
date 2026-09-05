import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoRuleset, mockGetGitHubInstallationToken } = vi.hoisted(() => ({
  mockGetRepoRuleset: vi.fn(),
  mockGetGitHubInstallationToken: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = { getRepoRuleset: mockGetRepoRuleset };
  },
}));

vi.mock("../githubAppAuth.js", () => ({
  getGitHubInstallationToken: mockGetGitHubInstallationToken,
}));

const {
  observeChiefGovernanceWithGitHubApp,
  planChiefGovernanceWithGitHubApp,
} = await import("../trustedGithubGovernanceObserver.js");

function readback(id: number, name: string, checks: Array<Record<string, unknown>>, bypassActors: Array<Record<string, unknown>>) {
  return {
    data: {
      id,
      name,
      target: "branch",
      enforcement: "active",
      bypass_actors: bypassActors,
      conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
      rules: [{
        type: "required_status_checks",
        parameters: { required_status_checks: checks },
      }],
    },
  };
}

describe("trusted Chief governance GitHub App observer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGitHubInstallationToken.mockResolvedValue("installation-token");
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
      ));
  });

  it("mints a repository-scoped installation token instead of accepting caller token authority", async () => {
    const result = await observeChiefGovernanceWithGitHubApp({
      appId: "85455",
      privateKey: "test-private-key",
      now: new Date("2026-09-05T21:20:00.000Z"),
    });

    expect(mockGetGitHubInstallationToken).toHaveBeenCalledWith(
      "85455",
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
    expect(result.governanceBoundary.observer).toEqual({ kind: "github-app", appId: "85455" });
    expect(result.exactHeadGate.observer).toEqual({ kind: "github-app", appId: "85455" });
    expect(result.exactHeadGate.authority.providerMutationAuthority).toBe(false);
  });

  it("refuses to plan a ruleset migration until an external candidate-check producer is observed", async () => {
    await expect(planChiefGovernanceWithGitHubApp({
      appId: "85455",
      privateKey: "test-private-key",
      now: new Date("2026-09-05T21:20:00.000Z"),
    })).rejects.toThrow(/external check producer integration is not yet observed/);
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
      appId: "85455",
      privateKey: "  ",
    })).rejects.toThrow(/requires a GitHub App private key/);
    expect(mockGetGitHubInstallationToken).not.toHaveBeenCalled();
  });
});
