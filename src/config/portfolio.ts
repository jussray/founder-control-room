import { L99_REPOSITORY_IDENTIFIER } from "./l99Repository.js";

export type PortfolioProjectStatus = "active" | "external";

export interface PortfolioProject {
  slug: string;
  name: string;
  repository: string;
  status: PortfolioProjectStatus;
  capabilities: readonly string[];
}

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
  },
  {
    slug: "juss-beautiful-hair",
    name: "Juss Beautiful Hair Storefront",
    repository: "jussray/jussbeautifulhair-site",
    status: "active",
    capabilities: ["commerce", "storefront", "playwright"],
  },
  {
    slug: "juss-beautiful-hair-private",
    name: "Juss Beautiful Hair Private Operations",
    repository: "jussray/jbh-private",
    status: "active",
    capabilities: ["commerce-admin", "private-operations"],
  },
  {
    slug: "l99",
    name: "L99 StoryEngine",
    repository: L99_REPOSITORY_IDENTIFIER,
    status: "active",
    capabilities: ["story-runtime", "artifact-generation", "provenance"],
  },
  {
    slug: "chief-ai-machine",
    name: "Chief AI Prompt Machine",
    repository: "jussray/chief-ai-machine",
    status: "active",
    capabilities: ["prompt-operations", "provider-routing"],
  },
  {
    slug: "untold-stories",
    name: "Untold Stories Storefront",
    repository: "jussray/untold-stories-storefront",
    status: "active",
    capabilities: ["shopify", "story-commerce", "playwright"],
  },
  {
    slug: "founder-control-room",
    name: "Founder Control Room",
    repository: "jussray/founder-control-room",
    status: "active",
    capabilities: ["portfolio-operations", "mcp-host", "approval-engine"],
  },
  {
    slug: "promptos",
    name: "PromptOS",
    repository: "jussray/promptos",
    status: "active",
    capabilities: ["prompt-registry", "ooda", "redteam", "l99", "lindymode"],
  },
] as const;

/**
 * Founder-owned repositories that are known to FCR for identity/continuity
 * only. Presence here grants no portfolio, MCP, decision, merge, deploy, or
 * execution authority.
 */
export const EXTERNAL_PROJECTS: readonly PortfolioProject[] = [
  {
    slug: "think-tank",
    name: "Think Tank",
    repository: "jussray/THINK-TANK",
    status: "external",
    capabilities: ["idea-memory", "scorecards", "continuity"],
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
  },
  {
    slug: "sweats",
    name: "Sweats",
    repository: "jussray/Sweats",
    status: "external",
    capabilities: ["product", "continuity"],
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

export const ACTIVE_PROJECT_SLUGS = new Set(
  PORTFOLIO_PROJECTS.map((project) => project.slug),
);

export const EXTERNAL_PROJECT_SLUGS = new Set(
  EXTERNAL_PROJECTS.map((project) => project.slug),
);

/** Authority-bearing lookup. External identities are intentionally invisible. */
export function getPortfolioProject(slug: string): PortfolioProject | undefined {
  return PORTFOLIO_PROJECTS.find((project) => project.slug === slug);
}

/** Read-only identity lookup for continuity/provenance code. Never an allowlist. */
export function getKnownProject(slug: string): PortfolioProject | undefined {
  return getPortfolioProject(slug) ?? EXTERNAL_PROJECTS.find((project) => project.slug === slug);
}
