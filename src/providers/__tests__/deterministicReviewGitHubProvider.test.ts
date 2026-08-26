import { describe, expect, it, vi } from "vitest";
import { DeterministicReviewGitHubProvider } from "../DeterministicReviewGitHubProvider.js";

const HEAD = "a".repeat(40);
const HASH = "b".repeat(64);
const NAME = `Independent Review / fcr-deterministic-review-v1 / ${HASH.slice(0, 12)}`;

function providerFor(fetchFn: typeof fetch, projectMap: Record<string, string> = {
  "founder-control-room": "jussray/founder-control-room",
}) {
  return new DeterministicReviewGitHubProvider(
    {
      token: "installation-token",
      projectMap,
      baseUrl: "https://github.example.test/api/v3",
    },
    { fetchFn },
  );
}

function publication(overrides: Partial<{
  headSha: string;
  name: string;
  reviewHash: string;
  summary: string;
}> = {}) {
  return {
    headSha: HEAD,
    name: NAME,
    reviewHash: HASH,
    summary: "Deterministic review completed with no V1 findings.",
    ...overrides,
  };
}

describe("DeterministicReviewGitHubProvider", () => {
  it("posts exactly one success-only Check Run bound to full review identity", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
    const provider = providerFor(fetchFn);

    await provider.publishDeterministicReviewWitness(
      "founder-control-room",
      publication(),
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!;
    expect(String(url)).toBe(
      "https://github.example.test/api/v3/repos/jussray/founder-control-room/check-runs",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer installation-token",
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      name: NAME,
      head_sha: HEAD,
      status: "completed",
      conclusion: "success",
      external_id: HASH,
      output: {
        title: "Deterministic independent review",
        summary: "Deterministic review completed with no V1 findings.",
      },
    });
  });

  it("rejects witness publication outside canonical Founder Control Room", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
    const provider = providerFor(fetchFn, { other: "jussray/other-repo" });

    await expect(provider.publishDeterministicReviewWitness(
      "other",
      publication(),
    )).rejects.toThrow(/restricted to Founder Control Room/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects malformed SHA, review hash, and name/hash mismatch before network mutation", async () => {
    const cases = [
      publication({ headSha: "not-a-sha" }),
      publication({ reviewHash: "not-a-hash" }),
      publication({ name: "Independent Review / fcr-deterministic-review-v1 / deadbeefdead" }),
    ];

    for (const candidate of cases) {
      const fetchFn = vi.fn(async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
      const provider = providerFor(fetchFn);
      await expect(provider.publishDeterministicReviewWitness(
        "founder-control-room",
        candidate,
      )).rejects.toThrow();
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it("rejects empty or oversized summaries before network mutation", async () => {
    for (const summary of ["", "x".repeat(65_536)]) {
      const fetchFn = vi.fn(async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
      const provider = providerFor(fetchFn);
      await expect(provider.publishDeterministicReviewWitness(
        "founder-control-room",
        publication({ summary }),
      )).rejects.toThrow(/summary/i);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it("fails closed when GitHub rejects Check Run creation", async () => {
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ message: "Resource not accessible by integration" }),
      { status: 403 },
    )) as unknown as typeof fetch;
    const provider = providerFor(fetchFn);

    await expect(provider.publishDeterministicReviewWitness(
      "founder-control-room",
      publication(),
    )).rejects.toThrow(/failed with 403.*Resource not accessible by integration/i);
  });
});
