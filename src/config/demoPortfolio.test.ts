import { describe, expect, it } from "vitest";

import { BIP_GENESIS_DEMO } from "./demoPortfolio.js";
import { getPortfolioProject, QUARANTINED_REPOSITORIES } from "./portfolio.js";

describe("Bip genesis demo provenance", () => {
  it("keeps the ChatGPT Sites genesis record separate from canonical product authority", () => {
    const canonical = getPortfolioProject(BIP_GENESIS_DEMO.productSlug);

    expect(canonical?.repository).toBe("jussray/Sekret-Bip");
    expect(BIP_GENESIS_DEMO.canonicalRepository).toBe(canonical?.repository);
    expect(BIP_GENESIS_DEMO.historicalDemoRepository).toBe("jussray/sekret-bip-demo");
    expect(QUARANTINED_REPOSITORIES.has(BIP_GENESIS_DEMO.historicalDemoRepository!)).toBe(true);
    expect(BIP_GENESIS_DEMO.authorityBoundary).toBe("demo-provenance-only");
  });

  it("records known history without inventing the unrecovered generated Sites URL", () => {
    expect(BIP_GENESIS_DEMO.authoringSurface).toBe("chatgpt-sites");
    expect(BIP_GENESIS_DEMO.historicalCustomDomain).toBe("https://sekretbip.net");
    expect(BIP_GENESIS_DEMO.generatedPlatformUrl).toBeNull();
    expect(BIP_GENESIS_DEMO.provenanceLevel).toBe("founder-recorded");
  });
});
