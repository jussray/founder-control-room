import { describe, expect, it } from "vitest";
import {
  classifyPublicCoverage,
  isMeaningfulPublicCoverage,
  renderPublicCoverageAlert,
} from "./publicCoverage.js";
import type { ExternalUseCandidate } from "./types.js";

function candidate(overrides: Partial<ExternalUseCandidate> = {}): ExternalUseCandidate {
  return {
    source: "exa_mcp",
    sourceTool: "deep_search_exa",
    evidenceUrl: "https://example.com/juss-coverage",
    title: "Juss & Co coverage",
    evidenceSummary: "Independent technical commentary discusses Juss & Co architecture, verification, runtime evidence, and implementation tradeoffs in enough detail to be substantive.",
    discoveryQuery: "test",
    observedAt: "2026-10-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("public coverage classification", () => {
  it("drops LinkedIn directory listings even when they contain the exact company name", () => {
    const mention = classifyPublicCoverage(candidate({
      evidenceUrl: "https://www.linkedin.com/pub/dir/%2B/Rayy",
      title: "Juss Rayy - LinkedIn",
      evidenceSummary: "People directory result listing Juss Rayy and Juss&Co among 400+ profiles.",
    }));
    expect(mention.materiality).toBe("NOISE");
    expect(isMeaningfulPublicCoverage(mention)).toBe(false);
  });

  it("classifies explicit investor commentary as material", () => {
    const mention = classifyPublicCoverage(candidate({
      title: "Investor analysis of Juss & Co",
      evidenceSummary: "An investor analysis examines Juss & Co as a potential venture-backed company, discussing capital, fundraising readiness, diligence, founder execution, and evidence quality in concrete terms.",
    }));
    expect(mention.audience).toBe("investor");
    expect(mention.materiality).toBe("MATERIAL");
    expect(isMeaningfulPublicCoverage(mention)).toBe(true);
  });

  it("classifies exact technical commentary as material", () => {
    const mention = classifyPublicCoverage(candidate());
    expect(mention.audience).toBe("technical");
    expect(mention.materiality).toBe("MATERIAL");
  });

  it("keeps substantive user feedback on watch", () => {
    const mention = classifyPublicCoverage(candidate({
      title: "A user reviews Juss & Co",
      evidenceSummary: "A customer describes using Juss & Co software, gives detailed feedback about the experience, explains what was helpful, and identifies friction they encountered during normal use.",
    }));
    expect(mention.audience).toBe("user");
    expect(mention.materiality).toBe("WATCH");
    expect(isMeaningfulPublicCoverage(mention)).toBe(true);
  });

  it("drops unrelated generic Juss references", () => {
    const mention = classifyPublicCoverage(candidate({
      title: "Juss joined a local event",
      evidenceSummary: "A short event recap about an unrelated person named Juss with no connection to the company, founder, or products.",
    }));
    expect(mention.materiality).toBe("NOISE");
  });

  it("drops Juss-owned GitHub evidence from the external coverage lane", () => {
    const mention = classifyPublicCoverage(candidate({
      evidenceUrl: "https://github.com/jussray/founder-control-room/blob/main/README.md",
      externalOwner: "jussray",
    }));
    expect(mention.materiality).toBe("NOISE");
  });

  it("renders the founder alert contract without inventing action", () => {
    const mention = classifyPublicCoverage(candidate());
    const rendered = renderPublicCoverageAlert([mention]);
    expect(rendered.text).toContain("Where:");
    expect(rendered.text).toContain("What was said:");
    expect(rendered.text).toContain("Why it matters:");
    expect(rendered.text).toContain("Follow-up worth reviewing:");
    expect(rendered.text).not.toContain("Contact them now");
  });
});
