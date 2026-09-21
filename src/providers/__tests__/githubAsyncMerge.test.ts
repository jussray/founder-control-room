import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    request = mockRequest;
  },
}));

const { mergeGitHubPullRequestAsync } = await import("../githubAsyncMerge.js");

const HEAD_SHA = "b".repeat(40);
const OTHER_HEAD_SHA = "a".repeat(40);
const MERGE_SHA = "d".repeat(40);
const UUID = "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42";

function options() {
  return {
    token: "test-token",
    repository: "jussray/founder-control-room",
    pullRequestNumber: 769,
    expectedHeadSha: HEAD_SHA,
    pollIntervalMs: 0,
    maxPollAttempts: 4,
  };
}

describe("mergeGitHubPullRequestAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("locks enqueue to the exact approved head and polls to a terminal merge SHA", async () => {
    mockRequest
      .mockResolvedValueOnce({
        status: 202,
        data: {
          status: "pending",
          details: {
            uuid: UUID,
            expected_head_sha: HEAD_SHA,
          },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          status: "pending",
          details: { uuid: UUID, expected_head_sha: HEAD_SHA },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          status: "merged",
          details: { sha: MERGE_SHA, message: "Merged" },
        },
      });

    await expect(mergeGitHubPullRequestAsync(options())).resolves.toBe(MERGE_SHA);

    expect(mockRequest).toHaveBeenNthCalledWith(
      1,
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async",
      expect.objectContaining({
        owner: "jussray",
        repo: "founder-control-room",
        pull_number: 769,
        sha: HEAD_SHA,
        merge_action: "default",
      }),
    );
    expect(mockRequest).toHaveBeenNthCalledWith(
      2,
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid}",
      expect.objectContaining({ uuid: UUID }),
    );
  });

  it("returns immediately when GitHub reports the PR already merged", async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      data: {
        status: "merged",
        details: { sha: MERGE_SHA, message: "Pull request is already merged." },
      },
    });

    await expect(mergeGitHubPullRequestAsync(options())).resolves.toBe(MERGE_SHA);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("reconciles an existing async request returned as HTTP 409 only when it matches the approved head", async () => {
    mockRequest
      .mockRejectedValueOnce({
        status: 409,
        response: {
          data: {
            status: "pending",
            details: { uuid: UUID, expected_head_sha: HEAD_SHA },
          },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          status: "merged",
          details: { sha: MERGE_SHA, message: "Merged" },
        },
      });

    await expect(mergeGitHubPullRequestAsync(options())).resolves.toBe(MERGE_SHA);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a 409 points at an async request for a different head", async () => {
    mockRequest.mockRejectedValueOnce({
      status: 409,
      response: {
        data: {
          status: "pending",
          details: { uuid: UUID, expected_head_sha: OTHER_HEAD_SHA },
        },
      },
    });

    await expect(mergeGitHubPullRequestAsync(options()))
      .rejects.toThrow(`not approved head ${HEAD_SHA}`);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a queued request later reports a different expected head", async () => {
    mockRequest
      .mockResolvedValueOnce({
        status: 202,
        data: {
          status: "pending",
          details: { uuid: UUID, expected_head_sha: HEAD_SHA },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          status: "pending",
          details: { uuid: UUID, expected_head_sha: OTHER_HEAD_SHA },
        },
      });

    await expect(mergeGitHubPullRequestAsync(options()))
      .rejects.toThrow(`not approved head ${HEAD_SHA}`);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a 409 cannot prove the existing request head", async () => {
    mockRequest.mockRejectedValueOnce({
      status: 409,
      response: {
        data: {
          status: "pending",
          details: { uuid: UUID },
        },
      },
    });

    await expect(mergeGitHubPullRequestAsync(options()))
      .rejects.toThrow("without a valid expected_head_sha");
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a terminal provider failure", async () => {
    mockRequest
      .mockResolvedValueOnce({
        status: 202,
        data: { status: "pending", details: { uuid: UUID } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          status: "failed",
          details: { message: "required repository rule failed" },
        },
      });

    await expect(mergeGitHubPullRequestAsync(options()))
      .rejects.toThrow("required repository rule failed");
  });

  it("fails closed instead of re-enqueueing when a request remains pending", async () => {
    mockRequest
      .mockResolvedValueOnce({
        status: 202,
        data: { status: "pending", details: { uuid: UUID } },
      })
      .mockResolvedValue({
        status: 200,
        data: { status: "pending", details: { uuid: UUID, expected_head_sha: HEAD_SHA } },
      });

    await expect(mergeGitHubPullRequestAsync({ ...options(), maxPollAttempts: 2 }))
      .rejects.toThrow(`reconcile this UUID before any retry`);
  });
});
