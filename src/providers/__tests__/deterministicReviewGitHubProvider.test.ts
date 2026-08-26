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

  it("carries GitHub Check Run external_id into the full evidence fingerprint", async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      return new Response(JSON.stringify({
        check_runs: [{
          id: 77,
          name: NAME,
          status: "completed",
          conclusion: "success",
          head_sha: HEAD,
          external_id: HASH.toUpperCase(),
          app: { id: 12345, slug: "fcr-review" },
          started_at: "2026-08-26T00:00:00Z",
          completed_at: "2026-08-26T00:00:01Z",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const provider = providerFor(fetchFn);

    const signals = await provider.listVerificationSignals("founder-control-room", HEAD);

    expect(signals).toEqual([
      expect.objectContaining({
        id: "77",
        name: NAME,
        status: "passed",
        commitSha: HEAD,
        provider: "github",
        evidenceFingerprint: HASH,
        issuer: { kind: "app", id: "12345", name: "fcr-review" },
      }),
    ]);
  });

  it("keeps missing external_id visibly unbound instead of manufacturing a fingerprint", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      check_runs: [{
        id: 78,
        name: NAME,
        status: "completed",
        conclusion: "success",
        head_sha: HEAD,
        app: { id: 12345, slug: "fcr-review" },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const provider = providerFor(fetchFn);

    const signals = await provider.listVerificationSignals("founder-control-room", HEAD);

    expect(signals[0]?.evidenceFingerprint).toBeUndefined();
  });

  it("rejects a custom API base in the normal runtime writer path", async () => {
    const provider = new DeterministicReviewGitHubProvider({
      token: "installation-token",
      projectMap: { "founder-control-room": "jussray/founder-control-room" },
      baseUrl: "https://attacker.example/api/v3",
    });

    await expect(provider.publishDeterministicReviewWitness(
      "founder-control-room",
      publication(),
    )).rejects.toThrow(/custom GitHub API base URL is test-only/i);
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
