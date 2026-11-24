import { Router } from "express";
import {
  DESIGN_COMMAND_DECK_CONTRACT,
  DESIGN_COMMAND_SHARED_CAPABILITY,
  DESIGN_COMMANDS,
  getDesignCommand,
} from "../../design-os/commands.js";
import {
  buildDesignOsSummary,
  getDesignOsProject,
  PORTFOLIO_DESIGN_REGISTRY,
  validateDesignOsRegistry,
} from "../../design-os/registry.js";
import { requireFounder } from "../middleware/requireFounder.js";

export const designOsRouter = Router();

designOsRouter.use(requireFounder);

const DESIGN_COMMAND_CONTRACT = {
  contract: DESIGN_COMMAND_DECK_CONTRACT,
  count: DESIGN_COMMANDS.length,
  sharedCapability: DESIGN_COMMAND_SHARED_CAPABILITY,
  commandsAreOperationsNotAuthority: true,
  mutatingCommandsRequireFounderApproval: true,
  uiRuntimeClaimsRequireExactHeadPlaywright: true,
  productNativeGrammarRequired: true,
  scopeOwnershipIsExclusiveByDefault: true,
} as const;

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
    commands: DESIGN_COMMANDS,
    commandContract: DESIGN_COMMAND_CONTRACT,
    truthBoundaries: {
      figmaIsNotRuntimeProof: true,
      designApprovalDoesNotAuthorizeImplementation: true,
      implementationDoesNotAuthorizeDeployment: true,
      noApprovalCarriesAcrossProjects: true,
    },
  });
});

/**
 * GET /design-os/commands
 *
 * Exposes the same 23 bounded design operations to every registered project
 * control room. This endpoint is descriptive only: it creates no approval,
 * mutation, deployment, or merge authority.
 */
designOsRouter.get("/commands", (_req, res) => {
  return res.json({
    commandContract: DESIGN_COMMAND_CONTRACT,
    commands: DESIGN_COMMANDS,
  });
});

/** GET /design-os/commands/:id — one bounded design operation. */
designOsRouter.get("/commands/:id", (req, res) => {
  const command = getDesignCommand(req.params.id);
  if (!command) {
    return res.status(404).json({
      error: "DESIGN_COMMAND_NOT_FOUND",
      commandId: req.params.id,
    });
  }

  return res.json({ command, commandContract: DESIGN_COMMAND_CONTRACT });
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

  return res.json({
    project,
    commands: DESIGN_COMMANDS,
    commandContract: DESIGN_COMMAND_CONTRACT,
  });
});
