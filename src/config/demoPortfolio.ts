export type DemoProvenanceLevel = "founder-recorded" | "repository-evidenced" | "unknown";

export interface DemoProvenanceRecord {
  id: string;
  productSlug: string;
  artifactClass: "genesis-site" | "historical-demo" | "live-product-demo";
  authoringSurface: string;
  historicalCustomDomain: string | null;
  generatedPlatformUrl: string | null;
  canonicalRepository: string;
  historicalDemoRepository: string | null;
  provenanceLevel: DemoProvenanceLevel;
  authorityBoundary: "demo-provenance-only";
  safeDemoAction: string;
  proofRequirements: readonly string[];
  stopConditions: readonly string[];
}

/**
 * Provenance for the first Se’kret Bip site created from the ChatGPT @Sites
 * workflow. This record intentionally does not make the historical artifact a
 * canonical project or production authority.
 *
 * The custom domain is founder-recorded history. The temporary/generated
 * ChatGPT Sites URL has not been recovered, so it remains null rather than
 * being guessed. The later jussray/sekret-bip-demo repository is a separate
 * historical demo lineage and stays quarantined from the active portfolio.
 */
export const BIP_GENESIS_DEMO: DemoProvenanceRecord = {
  id: "bip-chatgpt-sites-genesis",
  productSlug: "sekret-bip",
  artifactClass: "genesis-site",
  authoringSurface: "chatgpt-sites",
  historicalCustomDomain: "https://sekretbip.net",
  generatedPlatformUrl: null,
  canonicalRepository: "jussray/Sekret-Bip",
  historicalDemoRepository: "jussray/sekret-bip-demo",
  provenanceLevel: "founder-recorded",
  authorityBoundary: "demo-provenance-only",
  safeDemoAction: "Replay the idea-to-site lineage and inspect evidence without mutating production.",
  proofRequirements: [
    "founder-recorded ChatGPT @Sites custom-domain intent",
    "canonical Se’kret Bip repository identity",
    "historical demo repository kept separate from canonical authority",
  ],
  stopConditions: [
    "generated ChatGPT Sites URL is still unknown",
    "artifact identity conflicts with canonical product authority",
    "demo action would mutate production or user data",
  ],
};
