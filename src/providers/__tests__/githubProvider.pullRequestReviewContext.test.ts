import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetPullRequest } = vi.hoisted(() => ({
  mockGetPullRequest: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    pulls = { get: mockGetPullRequest };
  },
}));

const { GitHubProvider } = await import("../GitHubProvider.js");

const PROJECT_ID = "founder-control-room";
const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);

function buildProvider() {
  return new GitHubProvider({
    token: "test-token",
    projectMap: { [PROJECT_ID]: "jussray/founder-control-room" },
  });
}

describe("GitHubProvider.getPullRequestReviewContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPullRequest.mockResolvedValue({
      data: {
        number: 470,
        user: { login: "patch-author" },
        base: { ref: "main", sha: BASE_SHA },
        head: {
          ref: "mission/review-gate",
          sha: HEAD_SHA,
          repo: { full_name: "jussray/founder-control-room" },
        },
      },
    });
  });

  it("returns exact provider-backed repository, author, base, head, and SHA identity", async () => {
    const provider = buildProvider();
    const context = await provider.getPullRequestReviewContext(PROJECT_ID, 470);

    expect(mockGetPullRequest).toHaveBeenCalledWith({
      owner: "jussray",
      repo: "founder-control-room",
      pull_number: 470,
    });
    expect(context).toEqual({
      number: 470,
      repository: "jussray/founder-control-room",
      headRepository: "jussray/founder-control-room",
      baseRef: "main",
      headRef: "mission/review-gate",
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      authorIdentity: "patch-author",
    });
  });

  it("preserves an empty head repository when the provider cannot attest it", async () => {
    mockGetPullRequest.mockResolvedValue({
      data: {
        number: 470,
        user: { login: "patch-author" },
        base: { ref: "main", sha: BASE_SHA },
        head: { ref: "mission/review-gate", sha: HEAD_SHA, repo: null },
      },
    });

    const provider = buildProvider();
    const context = await provider.getPullRequestReviewContext(PROJECT_ID, 470);
    expect(context.headRepository).toBe("");
  });

  it("fails closed on invalid pull request numbers without querying GitHub", async () => {
    const provider = buildProvider();
    await expect(provider.getPullRequestReviewContext(PROJECT_ID, 0)).rejects.toThrow(/positive integer/);
    expect(mockGetPullRequest).not.toHaveBeenCalled();
  });
});
