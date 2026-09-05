import { describe, expect, it } from "vitest";
import { L99_REPOSITORY_IDENTIFIER } from "../config/l99Repository.js";
import {
  buildDesignOsSummary,
  getDesignOsProject,
  PORTFOLIO_DESIGN_REGISTRY,
  validateDesignOsRegistry,
} from "./registry.js";
import type { PortfolioDesignProject } from "./types.js";

function mutableRegistry(): PortfolioDesignProject[] {
  return structuredClone(PORTFOLIO_DESIGN_REGISTRY) as unknown as PortfolioDesignProject[];
}

describe("Portfolio Design OS registry", () => {
  it("covers all seven active repositories with unique identities", () => {
    const result = validateDesignOsRegistry();

    expect(result).toEqual({ ok: true, errors: [] });
    expect(PORTFOLIO_DESIGN_REGISTRY).toHaveLength(7);
    expect(new Set(PORTFOLIO_DESIGN_REGISTRY.map((project) => project.slug)).size).toBe(7);
    expect(new Set(PORTFOLIO_DESIGN_REGISTRY.map((project) => project.repoIdentifier)).size).toBe(7);
  });

  it("tracks the renamed StoryEngine repository without changing the stable design slug", () => {
    const project = getDesignOsProject("l99-story-engine");

    expect(project?.repoIdentifier).toBe(L99_REPOSITORY_IDENTIFIER);
    expect(project?.capabilityPrUrl).toBe(
      `https://github.com/${L99_REPOSITORY_IDENTIFIER}/pull/28`,
    );
    expect(project?.verification[0]?.url).toBe(
      `https://github.com/${L99_REPOSITORY_IDENTIFIER}/pull/28`,
    );
  });

  it("tracks current runtime profiles without converting runtime existence into design proof", () => {
    const bip = getDesignOsProject("sekret-bip");
    const chief = getDesignOsProject("chief-ai-machine");

    expect(bip?.runtimeProfile).toContain("React Native Web");
    expect(bip?.runtimeProfile).toContain("Python/FastAPI Piper TTS");
    expect(chief?.runtimeProfile).toContain("Cloudflare Worker backend/runtime");
    expect(chief?.runtimeProfile).not.toContain("remain planned");
    expect(bip?.implementationState).toBe("not_started");
    expect(chief?.implementationState).toBe("not_started");
  });

  it("registers the Command Center Figma file without claiming implementation proof", () => {
    const project = getDesignOsProject("founder-control-room");

    expect(project?.figma?.fileKey).toBe("QevLkXHXSzXfEsqsZltGRJ");
    expect(project?.designState).toBe("registered");
    expect(project?.implementationState).toBe("not_started");
    expect(project?.codeConnectMappings).toBe(0);
    expect(project?.truthBoundaries.designIsNotRuntimeProof).toBe(true);
  });

  it("reports readiness dimensions separately", () => {
    expect(buildDesignOsSummary()).toEqual({
      totalProjects: 7,
      registeredFigmaFiles: 1,
      designReadyProjects: 0,
      exactHeadVerifiedProjects: 0,
      deployedObservedProjects: 0,
      codeConnectCompleteProjects: 0,
      driftDetectedProjects: 0,
      unregisteredProjects: 6,
      truthState: "valid",
    });
  });

  it("fails closed when a truth boundary is weakened", () => {
    const registry = mutableRegistry();
    registry[0] = {
      ...registry[0],
      truthBoundaries: {
        ...registry[0].truthBoundaries,
        designIsNotRuntimeProof: false,
      },
    } as unknown as PortfolioDesignProject;

    const result = validateDesignOsRegistry(registry);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("founder-control-room: required truth boundaries were weakened");
  });

  it("rejects exact-head and deployed claims without corresponding evidence", () => {
    const registry = mutableRegistry();
    registry[1] = {
      ...registry[1],
      implementationState: "deployed_observed",
      verification: [],
    };

    const result = validateDesignOsRegistry(registry);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "sekret-bip: deployed_observed requires exact-head proof with a SHA",
    );
    expect(result.errors).toContain(
      "sekret-bip: deployed observation state requires deployment evidence",
    );
  });

  it("rejects Code Connect completion without actual mappings", () => {
    const registry = mutableRegistry();
    registry[2] = {
      ...registry[2],
      codeConnectState: "complete",
      codeConnectMappings: 0,
    };

    const result = validateDesignOsRegistry(registry);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "l99-story-engine: complete Code Connect state requires at least one mapping",
    );
  });
});
