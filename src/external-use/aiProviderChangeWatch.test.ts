import { describe, expect, it } from "vitest";
import {
  createAiProviderChangeReceipt,
  deterministicEventId,
  isNewCoverageFailure,
  providerForOfficialUrl,
  renderAiProviderChangeAlert,
} from "./aiProviderChangeWatch.js";
import type { ExternalUseCandidate } from "./types.js";

function candidate(overrides: Partial<ExternalUseCandidate> = {}): ExternalUseCandidate {
  return {
    source: "exa_mcp",
    sourceTool: "deep_search_exa",
    evidenceUrl: "https://openai.com/news/product-releases/example?utm_source=test#release",
    title: "New coding integration",
    evidenceSummary: "OpenAI announced a new code integration for eligible users.",
    discoveryQuery: "official provider releases",
    observedAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("AI provider change receipts", () => {
  it("accepts only URLs on an official provider domain", () => {
    expect(providerForOfficialUrl("https://help.openai.com/en/articles/1")).toBe("openai");
    expect(providerForOfficialUrl("https://openai.com.attacker.example/release")).toBeUndefined();
    expect(providerForOfficialUrl("https://attacker.example/openai.com")).toBeUndefined();
  });

  it("creates a reviewable receipt while leaving entitlement and project impact unknown", () => {
    const receipt = createAiProviderChangeReceipt(candidate(), "COMPLETE");
    expect(receipt).toMatchObject({
      schema: "juss.ai-provider-change@v1",
      provider: "openai",
      category: "integrations",
      availability: "UNKNOWN",
      published_at: null,
      source_coverage: "COMPLETE",
      project_impacts: { fcr: "UNKNOWN", chief: "UNKNOWN", solcontinuity: "UNKNOWN", promptos: "UNKNOWN" },
    });
    expect(receipt?.source_url).toBe("https://openai.com/news/product-releases/example");
    expect(receipt?.event_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("drops non-official and non-material search results", () => {
    expect(createAiProviderChangeReceipt(candidate({ evidenceUrl: "https://example.com/release" }), "COMPLETE"))
      .toBeUndefined();
    expect(createAiProviderChangeReceipt(candidate({ title: "Company newsroom", evidenceSummary: "A general company announcement." }), "COMPLETE"))
      .toBeUndefined();
  });

  it("derives a stable valid UUID for persistent duplicate suppression", () => {
    const first = deterministicEventId("a".repeat(64));
    expect(deterministicEventId("a".repeat(64))).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps notification wording at candidate and review level", () => {
    const receipt = createAiProviderChangeReceipt(candidate(), "PARTIAL");
    const alert = renderAiProviderChangeAlert(receipt ? [receipt] : [], [
      { provider: "anthropic", error_code: "0123456789abcdef" },
    ]);
    expect(alert.text).toContain("search candidates and coverage failures are listed for review");
    expect(alert.text).toContain("Availability: UNKNOWN");
    expect(alert.text).toContain("anthropic source search failed");
    expect(alert.text).not.toContain("available in your account");
  });

  it("alerts on a source failure transition once and suppresses repeated failed polls", () => {
    expect(isNewCoverageFailure(undefined)).toBe(true);
    expect(isNewCoverageFailure("PARTIAL")).toBe(true);
    expect(isNewCoverageFailure("FAILED")).toBe(false);
  });
});
