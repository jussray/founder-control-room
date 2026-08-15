import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListReviews, mockPaginate } = vi.hoisted(() => ({
  mockListReviews: vi.fn(),
  mockPaginate: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class MockOctokit {
    pulls = { listReviews: mockListReviews };
    paginate = mockPaginate;
  },
}));

const { GitHubProvider } = await import("../GitHubProvider.js");

const PROJECT_ID = "founder-control-room";
const HEAD = "b".repeat(40);
const RECEIPT = "1".repeat(64);
const OTHER_RECEIPT = "2".repeat(64);

function buildProvider() {
  return new GitHubProvider({
    token: "test-token",
    projectMap: { [PROJECT_ID]: "jussray/founder-control-room" },
  });
}

describe("GitHubProvider.listReviewSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaginate.mockResolvedValue([
      {
        id: 101,
        state: "APPROVED",
        body: `Independent review complete.\n\nReview-Receipt: ${RECEIPT}`,
        commit_id: HEAD,
        submitted_at: "2026-08-15T02:30:00Z",
        user: { login: "semantic-reviewer-1" },
        _links: { html: { href: "https://github.com/jussray/founder-control-room/pull/364#pullrequestreview-101" } },
      },
      {
        id: 102,
        state: "CHANGES_REQUESTED",
        body: "Blocking findings remain.",
        commit_id: "c".repeat(40),
        submitted_at: "2026-08-15T02:31:00Z",
        user: { login: "semantic-reviewer-2" },
        _links: { html: { href: "https://github.com/jussray/founder-control-room/pull/364#pullrequestreview-102" } },
      },
      {
        id: 103,
        state: "APPROVED",
        body: `Review-Receipt: ${RECEIPT}\nReview-Receipt: ${OTHER_RECEIPT}`,
        commit_id: HEAD,
        submitted_at: "2026-08-15T02:32:00Z",
        user: { login: "semantic-reviewer-3" },
        _links: { html: { href: "https://github.com/jussray/founder-control-room/pull/364#pullrequestreview-103" } },
      },
    ]);
  });

  it("maps provider-recorded reviewer identity, exact commit, state, and one receipt hash", async () => {
    const provider = buildProvider();
    const signals = await provider.listReviewSignals(PROJECT_ID, 364);

    expect(mockPaginate).toHaveBeenCalledWith(
      mockListReviews,
      expect.objectContaining({
        owner: "jussray",
        repo: "founder-control-room",
        pull_number: 364,
        per_page: 100,
      }),
    );
    expect(signals[0]).toEqual({
      id: "101",
      reviewerId: "semantic-reviewer-1",
      state: "approved",
      commitSha: HEAD,
      provider: "github",
      receiptHash: RECEIPT,
      submittedAt: "2026-08-15T02:30:00Z",
      detailsUrl: "https://github.com/jussray/founder-control-room/pull/364#pullrequestreview-101",
    });
    expect(signals[1]).toMatchObject({
      reviewerId: "semantic-reviewer-2",
      state: "changes_requested",
      receiptHash: undefined,
    });
  });

  it("fails closed when a provider review body carries multiple receipt markers", async () => {
    const provider = buildProvider();
    const signals = await provider.listReviewSignals(PROJECT_ID, 364);
    expect(signals[2]).toMatchObject({
      reviewerId: "semantic-reviewer-3",
      state: "approved",
      receiptHash: undefined,
    });
  });

  it("fails closed on invalid pull request numbers instead of querying the provider", async () => {
    const provider = buildProvider();
    await expect(provider.listReviewSignals(PROJECT_ID, 0)).rejects.toThrow(/positive integer/);
    expect(mockPaginate).not.toHaveBeenCalled();
  });
});
