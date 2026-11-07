import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCommit,
  mockListForRef,
} = vi.hoisted(() => ({
  mockGetCommit: vi.fn(),
  mockListForRef: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    repos = {
      getCommit: mockGetCommit,
    };
    checks = {
      listForRef: mockListForRef,
    };
  },
}));

const { GitHubProvider } = await import("../GitHubProvider.js");

const HEAD_SHA = "b".repeat(40);

function buildProvider() {
  return new GitHubProvider({
    token: "test-token",
    projectMap: {
      "founder-control-room": "jussray/founder-control-room",
    },
  });
}

describe("GitHubProvider verification issuer identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCommit.mockResolvedValue({
      data: {
        sha: HEAD_SHA,
        commit: {
          committer: { date: "2026-08-22T00:00:00Z" },
          author: { date: "2026-08-22T00:00:00Z" },
        },
      },
    });
  });

  it("preserves the GitHub Check Run App identity", async () => {
    mockListForRef.mockResolvedValue({
      data: {
        check_runs: [{
          id: 9001,
          name: "Independent Review / deterministic-review-v1 / abcdef123456",
          status: "completed",
          conclusion: "success",
          head_sha: HEAD_SHA,
          app: { id: 12345, slug: "founder-control-room-review" },
          started_at: "2026-08-22T00:00:00Z",
          completed_at: "2026-08-22T00:00:01Z",
          details_url: "https://example.test/check/9001",
        }],
      },
    });

    const provider = buildProvider();
    const [signal] = await provider.listVerificationSignals("founder-control-room", HEAD_SHA);

    expect(signal).toMatchObject({
      id: "9001",
      provider: "github",
      commitSha: HEAD_SHA,
      status: "passed",
      issuer: {
        kind: "app",
        id: "12345",
        name: "founder-control-room-review",
      },
    });
  });

  it("does not fabricate issuer identity when GitHub omits the App", async () => {
    mockListForRef.mockResolvedValue({
      data: {
        check_runs: [{
          id: 9002,
          name: "Independent Review / deterministic-review-v1 / abcdef123456",
          status: "completed",
          conclusion: "success",
          head_sha: HEAD_SHA,
          app: null,
          started_at: null,
          completed_at: null,
          details_url: null,
        }],
      },
    });

    const provider = buildProvider();
    const [signal] = await provider.listVerificationSignals("founder-control-room", HEAD_SHA);

    expect(signal?.issuer).toBeUndefined();
  });
});
