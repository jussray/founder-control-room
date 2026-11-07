import { describe, expect, it } from "vitest";

import { BIP_GENESIS_DEMO, BIP_LIVE_PRODUCT_DEMO } from "../demoPortfolio.js";
import { getPortfolioProject, QUARANTINED_REPOSITORIES } from "../portfolio.js";

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

describe("Bip live product demo contract", () => {
  it("reuses canonical Se’kret Bip identity without inheriting product authority", () => {
    const canonical = getPortfolioProject(BIP_LIVE_PRODUCT_DEMO.productSlug);

    expect(canonical?.repository).toBe("jussray/Sekret-Bip");
    expect(BIP_LIVE_PRODUCT_DEMO.canonicalRepository).toBe(canonical?.repository);
    expect(BIP_LIVE_PRODUCT_DEMO.canonicalBranch).toBe("main");
    expect(BIP_LIVE_PRODUCT_DEMO.sourceHeadPolicy).toBe("resolve-at-proof-time");
    expect(BIP_LIVE_PRODUCT_DEMO.authorityBoundary).toBe("inspect-only");
    expect(BIP_LIVE_PRODUCT_DEMO.visitorMode).toBe("anonymous");
  });

  it("stops the live demo before authentication, account creation, or private data", () => {
    expect(BIP_LIVE_PRODUCT_DEMO.liveUrl).toBe("https://app.sekretbip.net");
    expect(BIP_LIVE_PRODUCT_DEMO.journey.entryPath).toBe("/?bipDevAudience=teen");
    expect(BIP_LIVE_PRODUCT_DEMO.journey.stopPath).toBe("/welcome");
    expect(BIP_LIVE_PRODUCT_DEMO.journey.protectedRoutes).toEqual(["/comfort", "/approvals"]);

    expect(BIP_LIVE_PRODUCT_DEMO.deniedActions.join(" ")).toMatch(/create, modify, or authenticate a user account/i);
    expect(BIP_LIVE_PRODUCT_DEMO.deniedActions.join(" ")).toMatch(/private family data/i);
    expect(BIP_LIVE_PRODUCT_DEMO.deniedActions.join(" ")).toMatch(/Cloudflare Access service credentials/i);
    expect(BIP_LIVE_PRODUCT_DEMO.deniedActions.join(" ")).toMatch(/runtime equals current source main/i);
  });
});
