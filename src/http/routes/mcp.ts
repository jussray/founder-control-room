import { Router } from "express";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";
import { McpHub, advertisedToolNames } from "../../mcp/hub.js";
import type { McpInvocationRequest } from "../../mcp/types.js";

export const mcpRouter = Router();
const hub = new McpHub();

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

mcpRouter.get("/servers", requireFounder, (_req, res) => {
  return res.json({ servers: hub.listServers() });
});

mcpRouter.get(
  "/servers/:serverId/capabilities",
  requireFounder,
  async (req: FounderRequest, res) => {
    try {
      const projectId = projectIdFrom(req.query.projectId);
      const snapshot = await hub.discoverCapabilities(req.params.serverId, projectId);
      return res.json({
        serverId: snapshot.serverId,
        projectId: snapshot.projectId,
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
      return res.json(await hub.invoke(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blocked = /blocked|denied|allowlist|not enabled/i.test(message);
      return res.status(blocked ? 403 : 400).json({ error: message });
    }
  },
);
