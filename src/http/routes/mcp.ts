import { Router, type RequestHandler } from "express";
import { PORTFOLIO_PROJECTS } from "../../config/portfolio.js";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";
import { McpHub, advertisedToolNames } from "../../mcp/hub.js";
import type { McpInvocationRequest } from "../../mcp/types.js";
import { hubForMcpProject } from "../../mcp/vaultHub.js";
import { decoratePairedOAuthResponse } from "../../mcp/oauthToolMetadata.js";
import {
  PAIRED_MCP_OAUTH_AUDIENCE,
  PAIRED_MCP_OAUTH_SCOPE,
  usesLegacyStaticMcpToken,
  verifyPairedSupabaseOauthToken,
} from "../../mcp/pairedSupabaseOAuth.js";
import {
  buildPortfolioMcpRegistryResponse,
  PORTFOLIO_MCP_BRIDGE_PROJECTS,
} from "../../mcp/portfolioRegistry.js";
import { connectionVaultRouter } from "./connectionVault.js";
import { founderPermissionsRouter } from "./founderPermissions.js";
import { createRemoteReadMcpHandler } from "./remoteReadMcp.js";

export const mcpRouter = Router();
const registryHub = new McpHub();

const portfolioRemoteReadScope = PORTFOLIO_PROJECTS
  .map((project) => project.slug)
  .join(",");

// The authority-bearing portfolio registry is the single source of server-side
// MCP project scope. Supabase OAuth performs PKCE, dynamic client registration,
// token signing, and user consent. FCR then validates founder identity and may
// only narrow this server-owned portfolio grant.
const portfolioRemoteMcpEnv: NodeJS.ProcessEnv = {
  ...process.env,
  FCR_REMOTE_MCP_READ_PROJECTS: portfolioRemoteReadScope,
  FCR_REMOTE_MCP_OAUTH_AUDIENCE: PAIRED_MCP_OAUTH_AUDIENCE,
  FCR_REMOTE_MCP_OAUTH_REQUIRED_SCOPE: PAIRED_MCP_OAUTH_SCOPE,
};

function pairedOAuthMetadata(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const challengeHeader = res.getHeader("WWW-Authenticate");
      const challenge = typeof challengeHeader === "string"
        ? challengeHeader
        : Array.isArray(challengeHeader)
          ? challengeHeader.join(", ")
          : undefined;
      const method = typeof req.body?.method === "string" ? req.body.method : undefined;
      return originalJson(decoratePairedOAuthResponse(body, {
        method,
        scope: PAIRED_MCP_OAUTH_SCOPE,
        challenge,
      }));
    }) as typeof res.json;
    return handler(req, res, next);
  };
}

const handlePairedRemoteMcp = pairedOAuthMetadata(createRemoteReadMcpHandler({
  authMode: "oauth",
  env: portfolioRemoteMcpEnv,
  authenticateOauth: verifyPairedSupabaseOauthToken,
}));

const handleLegacyStaticRemoteReadMcp = createRemoteReadMcpHandler({
  authMode: "static",
  env: portfolioRemoteMcpEnv,
});

// Compatibility endpoint with automatic OAuth/DCR upgrade. Static auth is
// selected only for an exact timing-safe match to the legacy server token.
// Missing, malformed, or non-matching bearer credentials go through OAuth and
// can never downgrade into the static authority path.
const handleAutoDynamicRemoteReadMcp: RequestHandler = (req, res, next) => {
  if (usesLegacyStaticMcpToken(
    req.header("authorization"),
    portfolioRemoteMcpEnv.FCR_REMOTE_MCP_READ_TOKEN,
  )) {
    return handleLegacyStaticRemoteReadMcp(req, res, next);
  }
  return handlePairedRemoteMcp(req, res, next);
};

function projectIdFrom(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("projectId is required");
  }
  return value.trim();
}

function invocationFromRequest(
  req: FounderRequest,
  serverId: string,
  toolName: string,
): McpInvocationRequest {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const args = body.arguments ?? {};
  if (!args || Array.isArray(args) || typeof args !== "object") {
    throw new Error("arguments must be a JSON object");
  }

  return {
    serverId,
    toolName,
    projectId: projectIdFrom(body.projectId),
    arguments: args as Record<string, unknown>,
    missionId: typeof body.missionId === "string" ? body.missionId : undefined,
    approvalId: typeof body.approvalId === "string" ? body.approvalId : undefined,
  };
}

// Canonical ChatGPT/Claude/Manus connector lane. Supabase OAuth, founder
// allowlisting, server-owned project scope, narrow named tools, and evidence
// persistence all fail closed. DCR client IDs are accepted only after the
// founder completes Supabase authorization; an optional exact client allowlist
// can be enabled separately without making it a prerequisite for DCR.
mcpRouter.post("/", handlePairedRemoteMcp);

// Backward-compatible endpoint that now auto-upgrades to the same OAuth/DCR
// contract as /mcp. The legacy static token remains a bounded fallback only for
// callers that already possess that exact server-held credential.
mcpRouter.post("/read", handleAutoDynamicRemoteReadMcp);

// Public metadata only. This is a read-only MCP subregistry that lets clients
// such as Lovable discover the founder quartet without receiving credentials.
// Server credentials remain separate and are declared only as required secret
// headers in the registry metadata.
mcpRouter.get("/registry/v0.1/servers", (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const version = typeof req.query.version === "string" ? req.query.version : undefined;
  res.set("Cache-Control", "public, max-age=60");
  return res.json(buildPortfolioMcpRegistryResponse({ search, version }));
});

// FCR-hosted logical MCP servers for the projects that do not expose a native
// remote MCP endpoint. Each handler is hard-bound server-side to one project.
// SolContinuity remains an external continuity identity everywhere else: this
// grants only the dedicated static-token read/preview bridge, not portfolio,
// merge, deploy, provider-write, publication, billing, or execution authority.
for (const projectSlug of PORTFOLIO_MCP_BRIDGE_PROJECTS) {
  const projectScopedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    FCR_REMOTE_MCP_READ_PROJECTS: projectSlug,
  };
  mcpRouter.post(
    `/portfolio/${projectSlug}`,
    createRemoteReadMcpHandler({
      authMode: "static",
      env: projectScopedEnv,
    }),
  );
}

// Connection Vault is part of the MCP/connection authority surface. Its
// workflow-facing resolver uses short-lived hashed FCR bearer tokens; founder
// administration routes remain protected by requireFounder inside the router.
mcpRouter.use("/vault", connectionVaultRouter);

// Portable Ask-Founder broker. Requests carry zero execution authority. A
// separate interactive founder decision persists exact-scope decision state;
// independent review remains outside this router.
mcpRouter.use("/founder-permissions", founderPermissionsRouter);

mcpRouter.get("/servers", requireFounder, (_req, res) => {
  return res.json({ servers: registryHub.listServers() });
});

mcpRouter.get(
  "/servers/:serverId/capabilities",
  requireFounder,
  async (req: FounderRequest, res) => {
    try {
      const projectId = projectIdFrom(req.query.projectId);
      const hub = await hubForMcpProject(req.params.serverId, projectId);
      const snapshot = await hub.discoverCapabilities(req.params.serverId, projectId);
      return res.json({
        serverId: snapshot.serverId,
        projectId,
        tools: advertisedToolNames(snapshot.tools),
        discoveredAt: snapshot.discoveredAt,
        expiresAt: snapshot.expiresAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }
  },
);

mcpRouter.post(
  "/servers/:serverId/tools/:toolName/preview",
  requireFounder,
  async (req: FounderRequest, res) => {
    try {
      const request = invocationFromRequest(
        req,
        req.params.serverId,
        req.params.toolName,
      );
      const hub = await hubForMcpProject(request.serverId, request.projectId);
      return res.json(await hub.preview(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }
  },
);

mcpRouter.post(
  "/servers/:serverId/tools/:toolName/invoke",
  requireFounder,
  async (req: FounderRequest, res) => {
    try {
      const request = invocationFromRequest(
        req,
        req.params.serverId,
        req.params.toolName,
      );
      const hub = await hubForMcpProject(request.serverId, request.projectId);
      return res.json(await hub.invoke(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blocked = /blocked|denied|allowlist|not enabled/i.test(message);
      return res.status(blocked ? 403 : 400).json({ error: message });
    }
  },
);
