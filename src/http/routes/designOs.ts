import { Router } from "express";
import {
  buildDesignOsSummary,
  getDesignOsProject,
  PORTFOLIO_DESIGN_REGISTRY,
  validateDesignOsRegistry,
} from "../../design-os/registry.js";
import { requireFounder } from "../middleware/requireFounder.js";

export const designOsRouter = Router();

designOsRouter.use(requireFounder);

/**
 * GET /design-os
 *
 * Read-only portfolio design registry. The response keeps design, code,
 * exact-head proof, deployment observation, Code Connect, and drift as
 * separate dimensions so a polished Figma file cannot become false-green
 * operational evidence.
 */
designOsRouter.get("/", (_req, res) => {
  const validation = validateDesignOsRegistry();

  if (!validation.ok) {
    return res.status(500).json({
      error: "DESIGN_OS_REGISTRY_INVALID",
      details: validation.errors,
    });
  }

  return res.json({
    summary: buildDesignOsSummary(),
    projects: PORTFOLIO_DESIGN_REGISTRY,
    truthBoundaries: {
      figmaIsNotRuntimeProof: true,
      designApprovalDoesNotAuthorizeImplementation: true,
      implementationDoesNotAuthorizeDeployment: true,
      noApprovalCarriesAcrossProjects: true,
    },
  });
});

/**
 * GET /design-os/:slug
 *
 * Returns one repository's design contract and evidence state. Unknown slugs
 * fail closed instead of falling back to Founder Control Room or Se'kret Bip.
 */
designOsRouter.get("/:slug", (req, res) => {
  const validation = validateDesignOsRegistry();

  if (!validation.ok) {
    return res.status(500).json({
      error: "DESIGN_OS_REGISTRY_INVALID",
      details: validation.errors,
    });
  }

  const project = getDesignOsProject(req.params.slug);
  if (!project) {
    return res.status(404).json({
      error: "DESIGN_OS_PROJECT_NOT_FOUND",
      slug: req.params.slug,
    });
  }

  return res.json({ project });
});
