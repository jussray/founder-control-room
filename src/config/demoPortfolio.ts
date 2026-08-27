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

export interface LiveProductDemoContract {
  id: string;
  productSlug: string;
  artifactClass: "live-product-demo";
  canonicalRepository: string;
  canonicalBranch: "main";
  sourceHeadPolicy: "resolve-at-proof-time";
  liveUrl: string;
  visitorMode: "anonymous";
  authorityBoundary: "inspect-only";
  journey: {
    entryPath: string;
    enterTestId: string;
    stopPath: string;
    protectedRoutes: readonly string[];
  };
  allowedActions: readonly string[];
  deniedActions: readonly string[];
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

/**
 * First live portfolio workload behind the Genesis story.
 *
 * This contract intentionally mirrors Se’kret Bip's own anonymous production
 * browser boundary: render the public Teen front door, click Enter once, stop
 * at onboarding, and verify protected routes remain protected from a blank
 * session. Founder Control Room must not authenticate, create accounts, send
 * Cloudflare Access service credentials, or read/write private family data.
 *
 * The source main SHA is resolved at proof time. That observation is source
 * provenance only; this contract does not claim the live runtime is the exact
 * same SHA unless a separate deployment witness proves it.
 */
export const BIP_LIVE_PRODUCT_DEMO: LiveProductDemoContract = {
  id: "sekret-bip-live-anonymous-front-door",
  productSlug: "sekret-bip",
  artifactClass: "live-product-demo",
  canonicalRepository: "jussray/Sekret-Bip",
  canonicalBranch: "main",
  sourceHeadPolicy: "resolve-at-proof-time",
  liveUrl: "https://app.sekretbip.net",
  visitorMode: "anonymous",
  authorityBoundary: "inspect-only",
  journey: {
    entryPath: "/?bipDevAudience=teen",
    enterTestId: "web-welcome-enter",
    stopPath: "/welcome",
    protectedRoutes: ["/comfort", "/approvals"],
  },
  allowedActions: [
    "Render the public Teen front door in a blank browser session.",
    "Click Enter once and stop at the public onboarding boundary.",
    "Verify protected teen and parent routes remain inaccessible from a blank session.",
    "Capture screenshots and a receipt containing only public demo evidence.",
  ],
  deniedActions: [
    "Create, modify, or authenticate a user account.",
    "Submit signup, sign-in, password-recovery, or profile forms.",
    "Read or write teen, parent, journal, voice, media, approval, or private family data.",
    "Send Cloudflare Access service credentials or bypass the normal visitor path.",
    "Merge, deploy, migrate, publish, change secrets, or mutate provider state.",
    "Claim the live runtime equals current source main without a separate deployment witness.",
  ],
  proofRequirements: [
    "resolve the canonical Se’kret Bip main SHA at proof time",
    "Playwright executes against the anonymous production frontend without service-token headers",
    "Teen front door renders at a mobile viewport without horizontal overflow",
    "Enter routes to /welcome and proof stops before account creation or authentication",
    "protected teen and parent routes remain inaccessible from a blank session",
    "receipt is bound to the exact Founder Control Room proof head",
  ],
  stopConditions: [
    "canonical repository or main cannot be resolved",
    "normal anonymous production access is intercepted or unavailable",
    "the journey requires authentication, account creation, or private data access",
    "a protected route becomes readable from a blank session",
    "browser proof does not execute on the exact Founder Control Room head",
  ],
};
