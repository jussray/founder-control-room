import { describe, expect, it } from "vitest";
import {
  extractExternalUseCandidates,
  normalizeExternalUse,
  renderExternalUseDigest,
} from "./normalize.js";

const project = {
  slug: "sekret-bip",
  name: "Se’kret Bip",
  repository: "jussray/Sekret-Bip",
};

describe("external code-use normalization", () => {
  it("extracts external repositories and excludes founder-owned results", () => {
    const candidates = extractExternalUseCandidates({
      project,
      source: "github_mcp",
      sourceTool: "list_forks",
      discoveryQuery: "forks of jussray/Sekret-Bip",
      observedAt: "2026-07-24T04:00:00.000Z",
      result: {
        items: [
          {
            full_name: "outside-owner/sekret-bip-copy",
            html_url: "https://github.com/outside-owner/sekret-bip-copy",
            description: "Forked from jussray/Sekret-Bip for a prototype.",
          },
          {
            full_name: "jussray/another-internal-repo",
            html_url: "https://github.com/jussray/another-internal-repo",
          },
        ],
      },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.externalOwner).toBe("outside-owner");
  });

  it("produces a complete 5W1H record with confirmed fork confidence", () => {
    const normalized = normalizeExternalUse(project, {
      source: "github_mcp",
      sourceTool: "list_forks",
      evidenceUrl: "https://github.com/outside-owner/sekret-bip-copy",
      externalOwner: "outside-owner",
      externalRepository: "outside-owner/sekret-bip-copy",
      title: "sekret-bip-copy",
      evidenceSummary: "Forked from jussray/Sekret-Bip.",
      discoveryQuery: "forks of jussray/Sekret-Bip",
      observedAt: "2026-07-24T04:00:00.000Z",
    });

    expect(normalized.classification).toBe("confirmed");
    expect(normalized.confidence).toBeGreaterThan(0.9);
    expect(Object.values(normalized.fiveWOneH).every(Boolean)).toBe(true);
    expect(normalized.fiveWOneH.how).toContain("private source code was not sent");
  });

  it("renders an hourly digest even when no evidence exists", () => {
    const digest = renderExternalUseDigest({
      generatedAt: "2026-07-24T04:00:00.000Z",
      items: [],
      newItemCount: 0,
      warnings: ["exa_mcp_unavailable:test"],
    });

    expect(digest.subject).toContain("0 new / 0 tracked");
    expect(digest.text).toContain("No public external-use evidence");
    expect(digest.html).toContain("Coverage warnings");
  });
});
