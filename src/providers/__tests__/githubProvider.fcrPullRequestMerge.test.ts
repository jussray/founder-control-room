import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetBranch,
  mockRepoMerge,
  mockPullGet,
  mockPullMerge,
} = vi.hoisted(() => ({
  mockGetBranch: vi.fn(),
  mockRepoMerge: vi.fn(),
  mockPullGet: vi.fn(),
  mockPullMerge: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = {
      getBranch: mockGetBranch,
      merge: mockRepoMerge,
    };
    pulls = {
      get: mockPullGet,
      merge: mockPullMerge,
    };
  },
}));

const { GitHubProvider } = await import("../GitHubProvider.js");

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const MOVED_SHA = "c".repeat(40);
const MERGE_SHA = "d".repeat(40);
const PR_NUMBER = 474;
const HEAD_REF = "mission/review-gate";

function buildProvider() {
  return new GitHubProvider({
    token: "test-token",
    projectMap: {
      "founder-control-room": "jussray/founder-control-room",
      "sekret-bip": "jussray/Sekret-Bip",
    },
  });
}

function pullRequestData() {
  return {
    number: PR_NUMBER,
    state: "open",
    draft: false,
    base: { ref: "main", sha: BASE_SHA },
    head: {
      ref: HEAD_REF,
      sha: HEAD_SHA,
      repo: { full_name: "jussray/founder-control-room" },
    },
    user: { login: "patch-author" },
  };
}

describe("GitHubProvider FCR reviewed pull-request integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPullGet.mockResolvedValue({ data: pullRequestData() });
    mockGetBranch.mockImplementation(async ({ branch }: { branch: string }) => ({
      data: { commit: { sha: branch === "main" ? BASE_SHA : HEAD_SHA } },
    }));
    mockPullMerge.mockResolvedValue({
      data: { merged: true, sha: MERGE_SHA, message: "Pull Request successfully merged" },
    });
    mockRepoMerge.mockResolvedValue({ data: { sha: MERGE_SHA } });
  });

  it("merges FCR through the exact reviewed PR and never through direct branch integration", async () => {
    const provider = buildProvider();
    const context = await provider.getPullRequestReviewContext("founder-control-room", PR_NUMBER);
    expect(context.headSha).toBe(HEAD_SHA);

    await provider.resolveRef("founder-control-room", "main");
    await provider.resolveRef("founder-control-room", HEAD_REF);

    await expect(provider.integrate("founder-control-room", "main", HEAD_REF)).resolves.toBe(MERGE_SHA);

    expect(mockPullMerge).toHaveBeenCalledWith({
      owner: "jussray",
      repo: "founder-control-room",
      pull_number: PR_NUMBER,
      sha: HEAD_SHA,
    });
    expect(mockRepoMerge).not.toHaveBeenCalled();
  });

  it("fails closed when FCR integration lacks provider-backed PR context", async () => {
    const provider = buildProvider();
    await provider.resolveRef("founder-control-room", HEAD_REF);

    await expect(provider.integrate("founder-control-room", "main", HEAD_REF))
      .rejects.toThrow("requires provider-backed pull-request context");

    expect(mockPullMerge).not.toHaveBeenCalled();
    expect(mockRepoMerge).not.toHaveBeenCalled();
  });

  it("fails closed when the reviewed base was not re-resolved immediately before integration", async () => {
    const provider = buildProvider();
    await provider.getPullRequestReviewContext("founder-control-room", PR_NUMBER);
    await provider.resolveRef("founder-control-room", HEAD_REF);

    await expect(provider.integrate("founder-control-room", "main", HEAD_REF))
      .rejects.toThrow("requires resolveRef(main) immediately beforehand");

    expect(mockPullMerge).not.toHaveBeenCalled();
  });

  it("fails closed when the exact head moved after review context", async () => {
    mockGetBranch.mockImplementation(async ({ branch }: { branch: string }) => ({
      data: { commit: { sha: branch === "main" ? BASE_SHA : MOVED_SHA } },
    }));

    const provider = buildProvider();
    await provider.getPullRequestReviewContext("founder-control-room", PR_NUMBER);
    await provider.resolveRef("founder-control-room", "main");
    await provider.resolveRef("founder-control-room", HEAD_REF);

    await expect(provider.integrate("founder-control-room", "main", HEAD_REF))
      .rejects.toThrow("head moved after review context");

    expect(mockPullMerge).not.toHaveBeenCalled();
  });

  it("propagates a provider freshness rejection after the final local read and never falls back to direct integration", async () => {
    mockPullMerge.mockRejectedValueOnce(new Error("Required status checks require the pull request branch to be up to date"));

    const provider = buildProvider();
    await provider.getPullRequestReviewContext("founder-control-room", PR_NUMBER);
    await provider.resolveRef("founder-control-room", "main");
    await provider.resolveRef("founder-control-room", HEAD_REF);

    await expect(provider.integrate("founder-control-room", "main", HEAD_REF))
      .rejects.toThrow("pull request branch to be up to date");

    expect(mockPullMerge).toHaveBeenCalledTimes(1);
    expect(mockRepoMerge).not.toHaveBeenCalled();
  });

  it("keeps generic repositories on the provider-neutral branch integration path", async () => {
    const provider = buildProvider();
    await provider.resolveRef("sekret-bip", "mission/feature");

    await expect(provider.integrate("sekret-bip", "main", "mission/feature")).resolves.toBe(MERGE_SHA);

    expect(mockRepoMerge).toHaveBeenCalledWith({
      owner: "jussray",
      repo: "Sekret-Bip",
      base: "main",
      head: HEAD_SHA,
    });
    expect(mockPullMerge).not.toHaveBeenCalled();
  });
});