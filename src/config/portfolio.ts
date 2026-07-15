export type PortfolioProjectStatus = "active" | "quarantined";

export interface PortfolioProject {
  slug: string;
  name: string;
  repository: string;
  status: PortfolioProjectStatus;
  capabilities: string[];
}

/**
 * Founder-owned portfolio registry.
 *
 * This is a bootstrap registry for provider discovery and MCP policy. The
 * Control Room database remains the runtime source of truth once a project is
 * registered there. Legacy and duplicate repositories are explicitly kept out
 * of every MCP allowlist.
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
    slug: "jussbeautifulhair-site",
    name: "Juss Beautiful Hair Storefront",
    repository: "jussray/jussbeautifulhair-site",
    status: "active",
    capabilities: ["commerce", "storefront", "playwright"],
  },
  {
    slug: "jbh-private",
    name: "Juss Beautiful Hair Private Operations",
    repository: "jussray/jbh-private",
    status: "active",
    capabilities: ["commerce-admin", "private-operations"],
  },
  {
    slug: "l99-story-engine",
    name: "L99 StoryEngine",
    repository: "jussray/l99-StoryEngine",
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
    slug: "untold-stories-storefront",
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

export const QUARANTINED_REPOSITORIES = new Set([
  "jussray/do-not-use",
  "jussray/SekretBip_refactor_start",
  "jussray/Se-kretBip",
  "jussray/sekret-bip-demo",
  "jussray/Juss-beautiful-hair-",
  "jussray/jussbeautifulhair1",
]);

export const ACTIVE_PROJECT_SLUGS = new Set(
  PORTFOLIO_PROJECTS.filter((project) => project.status === "active").map(
    (project) => project.slug,
  ),
);

export function getPortfolioProject(slug: string): PortfolioProject | undefined {
  return PORTFOLIO_PROJECTS.find((project) => project.slug === slug);
}
