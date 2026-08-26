import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetPullRequestReviewContext,
  mockListReviewSignals,
  mockResolveRef,
  mockIntegrate,
} = vi.hoisted(() => ({
  mockGetPullRequestReviewContext: vi.fn(),
  mockListReviewSignals: vi.fn(),
  mockResolveRef: vi.fn(),
  mockIntegrate: vi.fn(),
}));

vi.mock("../githubAppAuth.js", () => ({
  getGitHubInstallationToken: vi.fn(),
}));

vi.mock("../GitHubProvider.js", () => ({
  GitHubProvider: class MockGitHubProvider {
    readonly name = "github";
    getPullRequestReviewContext = mockGetPullRequestReviewContext;
    listReviewSignals = mockListReviewSignals;
    resolveRef = mockResolveRef;
    integrate = mockIntegrate;
  },
}));

vi.mock("../GitLabProvider.js", () => ({
  GitLabProvider: class MockGitLabProvider {
    readonly name = "gitlab";
  },
}));

const { providerForProject } = await import("../providerFactory.js");

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const MOVED_BASE_SHA = "c".repeat(40);

const FCR_PROJECT = {
  repo_provider: "github",
  slug: "founder-control-room",
  repo_identifier: "jussray/founder-control-room",
};

const FCR_ALIAS_PROJECT = {
  repo_provider: "github",
  slug: "fcr-alias",
  repo_identifier: "jussray/founder-control-room",
};

const OTHER_PROJECT = {
  repo_provider: "github",
  slug: "sekret-bip",
  repo_identifier: "jussray/Sekret-Bip",
};

const reviewContext = {
  number: 474,
  repository: "jussray/founder-control-room",
  headRepository: "jussray/founder-control-room",
  baseRef: "main",
  headRef: "mission/review-gate",
  baseSha: BASE_SHA,
  headSha: HEAD_SHA,
  authorIdentity: "patch-author",
};

describe("LazyRepositoryProvider independent-review boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_PRIVATE_KEY", "");
    mockGetPullRequestReviewContext.mockResolvedValue(reviewContext);
    mockListReviewSignals.mockResolvedValue([{ id: "review-1" }]);
    mockResolveRef.mockImplementation(async (_projectId: string, ref: string) =>
      ref === "main" ? BASE_SHA : HEAD_SHA);
    mockIntegrate.mockResolvedValue("merge-sha");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("forwards provider-backed PR context and review signals through the lazy wrapper", async () => {
    const provider = providerForProject(FCR_PROJECT);

    await expect(provider.getPullRequestReviewContext!("founder-control-room", 474))
      .resolves.toEqual(reviewContext);
    await expect(provider.listReviewSignals!("founder-control-room", 474))
      .resolves.toEqual([{ id: "review-1" }]);

    expect(mockGetPullRequestReviewContext).toHaveBeenCalledWith("founder-control-room", 474);
    expect(mockListReviewSignals).toHaveBeenCalledWith("founder-control-room", 474);
  });

  it("does not expose deterministic witness authority through the GITHUB_TOKEN fallback", async () => {
    const provider = providerForProject(FCR_PROJECT);

    await expect(provider.publishDeterministicReviewWitness!("founder-control-room", {
      headSha: HEAD_SHA,
      name: "Independent Review / fcr-deterministic-review-v1 / abcdef123456",
      reviewHash: "d".repeat(64),
      summary: "must not publish with fallback token authority",
    })).rejects.toThrow(/requires GitHub App authority/i);
  });

  it("canonicalizes an alias of the FCR repository before review and integration authority", async () => {
    const provider = providerForProject(FCR_ALIAS_PROJECT);

    await expect(provider.getPullRequestReviewContext!("fcr-alias", 474))
      .resolves.toEqual(reviewContext);
    await expect(provider.integrate("fcr-alias", "main", "mission/review-gate"))
      .resolves.toBe("merge-sha");

    expect(mockGetPullRequestReviewContext).toHaveBeenCalledWith("founder-control-room", 474);
    expect(mockResolveRef).toHaveBeenNthCalledWith(1, "founder-control-room", "main");
    expect(mockResolveRef).toHaveBeenNthCalledWith(2, "founder-control-room", "mission/review-gate");
    expect(mockIntegrate).toHaveBeenCalledWith("founder-control-room", "main", "mission/review-gate");
  });

  it("blocks FCR integration when no exact PR context was read in the same execution", async () => {
    const provider = providerForProject(FCR_PROJECT);

    await expect(provider.integrate("founder-control-room", "main", "mission/review-gate"))
      .rejects.toThrow(/requires provider-backed pull-request context/);
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it("blocks attempts to integrate FCR into any base other than main", async () => {
    const provider = providerForProject(FCR_PROJECT);
    await provider.getPullRequestReviewContext!("founder-control-room", 474);

    await expect(provider.integrate("founder-control-room", "release", "mission/review-gate"))
      .rejects.toThrow(/reviewed integration authority is pinned to main/);
    expect(mockResolveRef).not.toHaveBeenCalled();
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it("blocks a PR that was retargeted away from main even if the reviewed SHA is unchanged", async () => {
    mockGetPullRequestReviewContext.mockResolvedValue({
      ...reviewContext,
      baseRef: "release",
    });
    const provider = providerForProject(FCR_PROJECT);
    await provider.getPullRequestReviewContext!("founder-control-room", 474);

    await expect(provider.integrate("founder-control-room", "main", "mission/review-gate"))
      .rejects.toThrow(/reviewed integration authority is pinned to main/);
    expect(mockResolveRef).not.toHaveBeenCalled();
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it("blocks head ref substitution after provider review context", async () => {
    const provider = providerForProject(FCR_PROJECT);
    await provider.getPullRequestReviewContext!("founder-control-room", 474);

    await expect(provider.integrate("founder-control-room", "main", "mission/other"))
      .rejects.toThrow(/integration refs changed after review context/);
    expect(mockResolveRef).not.toHaveBeenCalled();
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it("blocks FCR integration when the base branch moves after review context", async () => {
    mockResolveRef.mockImplementation(async (_projectId: string, ref: string) =>
      ref === "main" ? MOVED_BASE_SHA : HEAD_SHA);
    const provider = providerForProject(FCR_PROJECT);
    await provider.getPullRequestReviewContext!("founder-control-room", 474);

    await expect(provider.integrate("founder-control-room", "main", "mission/review-gate"))
      .rejects.toThrow(/base moved after review context/);
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it("re-reads exact base and head immediately before a valid FCR integration", async () => {
    const provider = providerForProject(FCR_PROJECT);
    await provider.getPullRequestReviewContext!("founder-control-room", 474);

    await expect(provider.integrate("founder-control-room", "main", "mission/review-gate"))
      .resolves.toBe("merge-sha");

    expect(mockResolveRef).toHaveBeenNthCalledWith(1, "founder-control-room", "main");
    expect(mockResolveRef).toHaveBeenNthCalledWith(2, "founder-control-room", "mission/review-gate");
    expect(mockIntegrate).toHaveBeenCalledWith("founder-control-room", "main", "mission/review-gate");
  });

  it("does not impose the FCR PR-context membrane on other projects", async () => {
    const provider = providerForProject(OTHER_PROJECT);

    await expect(provider.integrate("sekret-bip", "main", "mission/feature"))
      .resolves.toBe("merge-sha");

    expect(mockResolveRef).not.toHaveBeenCalled();
    expect(mockIntegrate).toHaveBeenCalledWith("sekret-bip", "main", "mission/feature");
  });
});
