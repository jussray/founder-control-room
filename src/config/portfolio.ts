import { L99_REPOSITORY_IDENTIFIER } from "./l99Repository.js";

export type PortfolioProjectStatus = "active" | "external" | "continuity-only";
export type MobileStoreTarget = "apple-app-store" | "google-play";
export type MobileCarrierStrategy =
  | "native-existing"
  | "native-client-required"
  | "hybrid-native-candidate"
  | "canonical-port-required";
export type MobileDistributionProofState = "planned" | "source-implemented";

export interface MobileDistributionIntent {
  targetStores: readonly MobileStoreTarget[];
  carrierStrategy: MobileCarrierStrategy;
  proofState: MobileDistributionProofState;
}

export interface PortfolioProject {
  slug: string;
  name: string;
  repository: string;
  status: PortfolioProjectStatus;
  capabilities: readonly string[];
  /**
   * Product distribution intent only. This field grants zero FCR execution,
   * merge, deploy, provider, publication, payment, or repository authority.
   */
  mobileDistribution?: MobileDistributionIntent;
}

const iosAndAndroidStores = ["apple-app-store", "google-play"] as const;

/**
 * Projects that currently carry FCR portfolio/MCP authority.
 *
 * Keep this collection active-only. Existing consumers historically treated
 * PORTFOLIO_PROJECTS as an authority-bearing allowlist, so known external
 * repositories must never be added here merely for discovery or continuity.
 * The Control Room database remains the runtime source of truth once a project
 * is registered there. Slugs intentionally match that existing registry.
 */
export const PORTFOLIO_PROJECTS: readonly PortfolioProject[] = [
  {
    slug: "sekret-bip",
    name: "Se’kret Bip",
    repository: "jussray/Sekret-Bip",
    status: "active",
    capabilities: ["mobile-app", "companion-runtime", "playwright", "figma"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-existing",
      proofState: "source-implemented",
    },
  },
  {
    slug: "juss-beautiful-hair",
    name: "Juss Beautiful Hair Storefront",
    repository: "jussray/jussbeautifulhair-site",
    status: "active",
    capabilities: ["commerce", "storefront", "playwright"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "hybrid-native-candidate",
      proofState: "planned",
    },
  },
  {
    slug: "juss-beautiful-hair-private",
    name: "Juss Beautiful Hair Private Operations",
    repository: "jussray/jbh-private",
    status: "active",
    capabilities: ["commerce-admin", "private-operations"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
  {
    slug: "l99",
    name: "L99 StoryEngine",
    repository: L99_REPOSITORY_IDENTIFIER,
    status: "active",
    capabilities: ["story-runtime", "artifact-generation", "provenance"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
  {
    slug: "chief-ai-machine",
    name: "Chief AI Prompt Machine",
    repository: "jussray/chief-ai-machine",
    status: "active",
    capabilities: ["prompt-operations", "provider-routing"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
  {
    slug: "untold-stories",
    name: "Untold Stories Storefront",
    repository: "jussray/untold-stories-storefront",
    status: "active",
    capabilities: ["shopify", "story-commerce", "playwright"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "hybrid-native-candidate",
      proofState: "planned",
    },
  },
  {
    slug: "founder-control-room",
    name: "Founder Control Room",
    repository: "jussray/founder-control-room",
    status: "active",
    capabilities: ["portfolio-operations", "mcp-host", "approval-engine"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
  {
    slug: "promptos",
    name: "PromptOS",
    repository: "jussray/promptos",
    status: "active",
    capabilities: ["prompt-registry", "ooda", "redteam", "l99", "lindymode"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
] as const;

/**
 * Founder-owned repositories whose ordered Founder Intelligence challenge stack
 * has been re-observed on their current main branch. These remain identity /
 * continuity metadata only and grant no FCR execution authority.
 */
export const EXTERNAL_PROJECTS: readonly PortfolioProject[] = [
  {
    slug: "think-tank",
    name: "Think Tank",
    repository: "jussray/THINK-TANK",
    status: "external",
    capabilities: ["idea-memory", "scorecards", "continuity"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "hybrid-native-candidate",
      proofState: "planned",
    },
  },
  {
    slug: "solcontinuity",
    name: "SolContinuity",
    repository: "jussray/solcontinuity",
    status: "external",
    capabilities: ["continuity", "evidence-history", "resilience"],
  },
  {
    slug: "sleepwealth-agent",
    name: "SleepWealth Agent",
    repository: "jussray/SleepWealth-Agent",
    status: "external",
    capabilities: ["agent-runtime", "audit", "risk-gates"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
  {
    slug: "sweats",
    name: "Sweats",
    repository: "jussray/Sweats",
    status: "external",
    capabilities: ["product", "continuity"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "hybrid-native-candidate",
      proofState: "planned",
    },
  },
] as const;

export const QUARANTINED_REPOSITORIES = new Set([
  "jussray/do-not-use",
  "jussray/don-t-touch-this-one",
  "jussray/SekretBip_refactor_start",
  "jussray/Se-kretBip",
  "jussray/sekret-bip-demo",
  "jussray/Juss-beautiful-hair-",
  "jussray/jussbeautifulhair1",
]);

/**
 * Founder-owned repositories that should participate in portfolio continuity,
 * provenance, and TRUE-first observation, but whose canonical Founder
 * Intelligence challenge-stack inheritance has not yet been proven on current
 * main. This is deliberately weaker than EXTERNAL_PROJECTS and carries zero
 * merge, deploy, MCP, provider, publication, payment, or mutation authority.
 */
export const CONTINUITY_ONLY_PROJECTS: readonly PortfolioProject[] = [
  {
    slug: "bip-jr",
    name: "Bip Jr",
    repository: "jussray/Bip-Jr",
    status: "continuity-only",
    capabilities: ["bip-universe", "continuity"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "canonical-port-required",
      proofState: "planned",
    },
  },
  {
    slug: "truth-compass",
    name: "Truth Compass",
    repository: "jussray/truth-compass",
    status: "continuity-only",
    capabilities: ["truth-analysis", "evidence", "continuity"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
  {
    slug: "truth-weaver",
    name: "Truth Weaver",
    repository: "jussray/truth-weaver",
    status: "continuity-only",
    capabilities: ["decision-control", "evidence", "continuity"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
  {
    slug: "alexa-commerce-engine",
    name: "Alexa Commerce Engine",
    repository: "jussray/alexa-commerce-engine-",
    status: "continuity-only",
    capabilities: ["commerce-agent", "continuity"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "native-client-required",
      proofState: "planned",
    },
  },
  {
    slug: "sync-party",
    name: "Sync Party",
    repository: "jussray/sync-party-game",
    status: "continuity-only",
    capabilities: ["party-game", "realtime", "continuity"],
    mobileDistribution: {
      targetStores: iosAndAndroidStores,
      carrierStrategy: "hybrid-native-candidate",
      proofState: "planned",
    },
  },
] as const;

export const ACTIVE_PROJECT_SLUGS = new Set(
  PORTFOLIO_PROJECTS.map((project) => project.slug),
);

export const EXTERNAL_PROJECT_SLUGS = new Set(
  EXTERNAL_PROJECTS.map((project) => project.slug),
);

export const CONTINUITY_ONLY_PROJECT_SLUGS = new Set(
  CONTINUITY_ONLY_PROJECTS.map((project) => project.slug),
);

/** Authority-bearing lookup. Non-active identities are intentionally invisible. */
export function getPortfolioProject(slug: string): PortfolioProject | undefined {
  return PORTFOLIO_PROJECTS.find((project) => project.slug === slug);
}

/** Read-only identity lookup for continuity/provenance code. Never an allowlist. */
export function getKnownProject(slug: string): PortfolioProject | undefined {
  return getPortfolioProject(slug)
    ?? EXTERNAL_PROJECTS.find((project) => project.slug === slug)
    ?? CONTINUITY_ONLY_PROJECTS.find((project) => project.slug === slug);
}
