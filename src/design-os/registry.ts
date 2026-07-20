import type {
  ImplementationState,
  PortfolioDesignProject,
  PortfolioDesignSummary,
  RegistryValidationResult,
} from "./types.js";

const TRUTH_BOUNDARIES = {
  designIsNotRuntimeProof: true,
  approvalDoesNotAuthorizeImplementation: true,
  implementationDoesNotAuthorizeDeployment: true,
  syntheticOrSanitizedDataOnly: true,
} as const;

export const PORTFOLIO_DESIGN_REGISTRY = [
  {
    slug: "founder-control-room",
    name: "Founder Control Room",
    repoIdentifier: "jussray/founder-control-room",
    runtimeProfile: "TypeScript, Express, Supabase, and Cloudflare Worker control surfaces",
    dataBoundary: "restricted",
    capabilityBranch: "agent/product-design-contract-refresh",
    capabilityPrUrl: "https://github.com/jussray/founder-control-room/pull/61",
    repositoryProfilePath: ".figma/repository-profile.json",
    figma: {
      fileKey: "QevLkXHXSzXfEsqsZltGRJ",
      fileName: "Johnstown Economic Opportunity Command Center",
      url: "https://www.figma.com/design/QevLkXHXSzXfEsqsZltGRJ",
      registeredAt: "2026-07-17",
    },
    designState: "registered",
    implementationState: "not_started",
    codeConnectState: "not_configured",
    codeConnectMappings: 0,
    driftState: "unknown",
    verification: [
      {
        kind: "manual_review",
        label: "Portfolio Figma capability contract merged through PR #61",
        url: "https://github.com/jussray/founder-control-room/pull/61",
      },
    ],
    truthBoundaries: TRUTH_BOUNDARIES,
    notes: [
      "The file is registered, but the command-center screen is not yet implementation proof.",
      "The Figma file must use synthetic or sanitized municipal and operational data.",
    ],
  },
  {
    slug: "sekret-bip",
    name: "Se'kret Bip",
    repoIdentifier: "jussray/Sekret-Bip",
    runtimeProfile: "Expo Router, React Native, TypeScript, Supabase, and Cloudflare boundaries",
    dataBoundary: "restricted",
    capabilityBranch: "agent/figma-build-implement-skill",
    capabilityPrUrl: "https://github.com/jussray/Sekret-Bip/pull/485",
    repositoryProfilePath: ".figma/repository-profile.json",
    designState: "unregistered",
    implementationState: "not_started",
    codeConnectState: "not_configured",
    codeConnectMappings: 0,
    driftState: "unknown",
    verification: [
      {
        kind: "manual_review",
        label: "Repository Figma capability opened as draft PR #485",
        url: "https://github.com/jussray/Sekret-Bip/pull/485",
      },
    ],
    truthBoundaries: TRUTH_BOUNDARIES,
    notes: [
      "No portfolio registry Figma file is assigned yet.",
      "Teen, journal, voice, media, parent-visibility, auth, and safety data are forbidden in design fixtures.",
    ],
  },
  {
    slug: "l99-story-engine",
    name: "L99 StoryEngine",
    repoIdentifier: "jussray/l99-StoryEngine",
    runtimeProfile: "Story runtime, creator studio, artifact provenance, event, and promotion pipelines",
    dataBoundary: "restricted",
    capabilityBranch: "agent/figma-build-implement-skill",
    capabilityPrUrl: "https://github.com/jussray/l99-StoryEngine/pull/28",
    repositoryProfilePath: ".figma/repository-profile.json",
    designState: "unregistered",
    implementationState: "not_started",
    codeConnectState: "not_configured",
    codeConnectMappings: 0,
    driftState: "unknown",
    verification: [
      {
        kind: "manual_review",
        label: "Repository Figma capability opened as draft PR #28",
        url: "https://github.com/jussray/l99-StoryEngine/pull/28",
      },
    ],
    truthBoundaries: TRUTH_BOUNDARIES,
    notes: [
      "No portfolio registry Figma file is assigned yet.",
      "Design must not create a second canon, memory source, event bus, renderer, provenance engine, or release authority.",
    ],
  },
  {
    slug: "chief-ai-machine",
    name: "Chief AI Machine",
    repoIdentifier: "jussray/chief-ai-machine",
    runtimeProfile: "Vanilla HTML, CSS, and JavaScript SPA; private backend capabilities remain planned",
    dataBoundary: "restricted",
    capabilityBranch: "agent/figma-build-implement-skill",
    capabilityPrUrl: "https://github.com/jussray/chief-ai-machine/pull/18",
    repositoryProfilePath: ".figma/repository-profile.json",
    designState: "unregistered",
    implementationState: "not_started",
    codeConnectState: "not_configured",
    codeConnectMappings: 0,
    driftState: "unknown",
    verification: [
      {
        kind: "manual_review",
        label: "Repository Figma capability opened as draft PR #18",
        url: "https://github.com/jussray/chief-ai-machine/pull/18",
      },
    ],
    truthBoundaries: TRUTH_BOUNDARIES,
    notes: [
      "No portfolio registry Figma file is assigned yet.",
      "A prototype must not be labeled as authenticated, private, multi-user, or model-executing without backend proof.",
    ],
  },
  {
    slug: "juss-beautiful-hair-public",
    name: "Juss Beautiful Hair Public",
    repoIdentifier: "jussray/jussbeautifulhair-site",
    runtimeProfile: "React and Vite storefront with a minimal Cloudflare checkout-session Worker",
    dataBoundary: "public",
    capabilityBranch: "agent/figma-build-implement-skill",
    capabilityPrUrl: "https://github.com/jussray/jussbeautifulhair-site/pull/19",
    repositoryProfilePath: ".figma/repository-profile.json",
    designState: "unregistered",
    implementationState: "not_started",
    codeConnectState: "not_configured",
    codeConnectMappings: 0,
    driftState: "unknown",
    verification: [
      {
        kind: "manual_review",
        label: "Repository Figma capability opened as draft PR #19",
        url: "https://github.com/jussray/jussbeautifulhair-site/pull/19",
      },
    ],
    truthBoundaries: TRUTH_BOUNDARIES,
    notes: [
      "No portfolio registry Figma file is assigned yet.",
      "Public designs may not contain customer, order, vendor, sourcing, margin, webhook, credential, or private-admin data.",
    ],
  },
  {
    slug: "untold-stories-storefront",
    name: "Untold Stories Storefront",
    repoIdentifier: "jussray/untold-stories-storefront",
    runtimeProfile: "Shopify Hydrogen, React, GraphQL, and fixture-safe storefront verification",
    dataBoundary: "public",
    capabilityBranch: "agent/figma-build-implement-skill",
    capabilityPrUrl: "https://github.com/jussray/untold-stories-storefront/pull/18",
    repositoryProfilePath: ".figma/repository-profile.json",
    designState: "unregistered",
    implementationState: "not_started",
    codeConnectState: "not_configured",
    codeConnectMappings: 0,
    driftState: "unknown",
    verification: [
      {
        kind: "manual_review",
        label: "Repository Figma capability opened as draft PR #18",
        url: "https://github.com/jussray/untold-stories-storefront/pull/18",
      },
    ],
    truthBoundaries: TRUTH_BOUNDARIES,
    notes: [
      "No portfolio registry Figma file is assigned yet.",
      "Designs must not invent Shopify products, variants, inventory, pricing, fulfillment, or production release state.",
    ],
  },
  {
    slug: "juss-beautiful-hair-private",
    name: "Juss Beautiful Hair Private",
    repoIdentifier: "jussray/jbh-private",
    runtimeProfile: "Loopback-only owner/admin system with an isolated API-only Cloudflare payment Worker",
    dataBoundary: "private",
    capabilityBranch: "agent/figma-build-implement-skill",
    capabilityPrUrl: "https://github.com/jussray/jbh-private/pull/10",
    repositoryProfilePath: ".figma/repository-profile.json",
    designState: "unregistered",
    implementationState: "not_started",
    codeConnectState: "not_configured",
    codeConnectMappings: 0,
    driftState: "unknown",
    verification: [
      {
        kind: "manual_review",
        label: "Repository Figma capability opened as draft PR #10",
        url: "https://github.com/jussray/jbh-private/pull/10",
      },
    ],
    truthBoundaries: TRUTH_BOUNDARIES,
    notes: [
      "No portfolio registry Figma file is assigned yet.",
      "Any future Figma file must remain private and use synthetic or redacted operational records only.",
    ],
  },
] as const satisfies readonly PortfolioDesignProject[];

const EXACT_HEAD_STATES = new Set<ImplementationState>([
  "exact_head_verified",
  "deployed_observed",
]);

export function validateDesignOsRegistry(
  registry: readonly PortfolioDesignProject[] = PORTFOLIO_DESIGN_REGISTRY,
): RegistryValidationResult {
  const errors: string[] = [];
  const slugs = new Set<string>();
  const repositories = new Set<string>();

  for (const project of registry) {
    if (slugs.has(project.slug)) errors.push(`Duplicate project slug: ${project.slug}`);
    if (repositories.has(project.repoIdentifier)) {
      errors.push(`Duplicate repository identifier: ${project.repoIdentifier}`);
    }
    slugs.add(project.slug);
    repositories.add(project.repoIdentifier);

    if (project.designState === "unregistered" && project.figma) {
      errors.push(`${project.slug}: unregistered design state cannot include a Figma registration`);
    }
    if (project.designState !== "unregistered" && !project.figma) {
      errors.push(`${project.slug}: ${project.designState} design state requires a Figma registration`);
    }
    if (project.figma && !project.figma.url.includes(project.figma.fileKey)) {
      errors.push(`${project.slug}: Figma URL does not contain its file key`);
    }

    if (!Number.isInteger(project.codeConnectMappings) || project.codeConnectMappings < 0) {
      errors.push(`${project.slug}: Code Connect mapping count must be a non-negative integer`);
    }
    if (project.codeConnectState === "complete" && project.codeConnectMappings === 0) {
      errors.push(`${project.slug}: complete Code Connect state requires at least one mapping`);
    }
    if (
      (project.codeConnectState === "not_configured" || project.codeConnectState === "not_eligible") &&
      project.codeConnectMappings > 0
    ) {
      errors.push(`${project.slug}: unmapped Code Connect state cannot report mappings`);
    }

    if (EXACT_HEAD_STATES.has(project.implementationState)) {
      const exactHeadProof = project.verification.find(
        (reference) => reference.kind === "exact_head" && Boolean(reference.sha),
      );
      if (!exactHeadProof) {
        errors.push(`${project.slug}: ${project.implementationState} requires exact-head proof with a SHA`);
      }
    }

    if (
      project.implementationState === "deployed_observed" &&
      !project.verification.some((reference) => reference.kind === "deployment_observation")
    ) {
      errors.push(`${project.slug}: deployed observation state requires deployment evidence`);
    }

    if (!project.capabilityPrUrl.startsWith(`https://github.com/${project.repoIdentifier}/pull/`)) {
      errors.push(`${project.slug}: capability PR URL does not match the repository`);
    }

    const truth = project.truthBoundaries;
    if (
      truth.designIsNotRuntimeProof !== true ||
      truth.approvalDoesNotAuthorizeImplementation !== true ||
      truth.implementationDoesNotAuthorizeDeployment !== true ||
      truth.syntheticOrSanitizedDataOnly !== true
    ) {
      errors.push(`${project.slug}: required truth boundaries were weakened`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function getDesignOsProject(slug: string): PortfolioDesignProject | undefined {
  return PORTFOLIO_DESIGN_REGISTRY.find((project) => project.slug === slug);
}

export function buildDesignOsSummary(
  registry: readonly PortfolioDesignProject[] = PORTFOLIO_DESIGN_REGISTRY,
): PortfolioDesignSummary {
  const validation = validateDesignOsRegistry(registry);

  return {
    totalProjects: registry.length,
    registeredFigmaFiles: registry.filter((project) => Boolean(project.figma)).length,
    designReadyProjects: registry.filter(
      (project) => project.designState === "review_ready" || project.designState === "approved",
    ).length,
    exactHeadVerifiedProjects: registry.filter(
      (project) =>
        project.implementationState === "exact_head_verified" ||
        project.implementationState === "deployed_observed",
    ).length,
    deployedObservedProjects: registry.filter(
      (project) => project.implementationState === "deployed_observed",
    ).length,
    codeConnectCompleteProjects: registry.filter(
      (project) => project.codeConnectState === "complete",
    ).length,
    driftDetectedProjects: registry.filter(
      (project) => project.driftState === "drift_detected" || project.driftState === "stale",
    ).length,
    unregisteredProjects: registry.filter((project) => project.designState === "unregistered").length,
    truthState: validation.ok ? "valid" : "invalid",
  };
}
