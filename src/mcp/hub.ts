import { createHash, randomUUID } from "node:crypto";
import { supabase } from "../lib/supabaseClient.js";
import { McpHttpClient } from "./client.js";
import { evaluateMcpPolicy } from "./policy.js";
import { McpRegistry } from "./registry.js";
import type {
  McpCapabilitySnapshot,
  McpEvidenceInput,
  McpInvocationRequest,
  McpInvocationResult,
  McpPolicyResult,
  McpToolDefinition,
} from "./types.js";

const CAPABILITY_CACHE_MS = 5 * 60_000;
const SECRET_KEY_PATTERN = /(authorization|password|passwd|secret|token|api[_-]?key|service[_-]?role)/i;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function requestHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function assertNoSecretArguments(value: unknown, path = "arguments"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretArguments(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Secret-bearing argument key is not allowed: ${path}.${key}`);
    }
    assertNoSecretArguments(item, `${path}.${key}`);
  }
}

function summarizeRequest(request: McpInvocationRequest): Record<string, unknown> {
  const serialized = JSON.stringify(request.arguments);
  return {
    argumentKeys: Object.keys(request.arguments).sort(),
    argumentBytes: Buffer.byteLength(serialized, "utf8"),
    hasMission: Boolean(request.missionId),
    hasApproval: Boolean(request.approvalId),
  };
}

function summarizeResponse(result: unknown): Record<string, unknown> {
  const serialized = JSON.stringify(result);
  return {
    type: Array.isArray(result) ? "array" : typeof result,
    bytes: Buffer.byteLength(serialized ?? "", "utf8"),
  };
}

async function writeEvidence(input: McpEvidenceInput): Promise<string> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", input.projectId)
    .maybeSingle();

  if (projectError) throw new Error(`MCP evidence project lookup failed: ${projectError.message}`);
  if (!project) throw new Error(`MCP evidence project is not registered: ${input.projectId}`);

  const evidenceId = randomUUID();
  const { error } = await supabase.from("mcp_tool_calls").insert({
    id: evidenceId,
    project_id: project.id,
    mission_id: input.missionId ?? null,
    approval_id: input.approvalId ?? null,
    server_id: input.serverId,
    tool_name: input.toolName,
    risk: input.risk,
    policy_decision: input.policyDecision,
    status: input.status,
    request_hash: input.requestHash,
    request_summary: input.requestSummary,
    response_summary: input.responseSummary ?? {},
    duration_ms: input.durationMs ?? null,
    estimated_cost_usd: input.estimatedCostUsd ?? 0,
    error_code: input.errorCode ?? null,
  });

  if (error) throw new Error(`MCP evidence write failed: ${error.message}`);
  return evidenceId;
}

export class McpHub {
  private readonly cache = new Map<string, McpCapabilitySnapshot>();

  constructor(
    private readonly registry = new McpRegistry(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  listServers() {
    return this.registry.publicView(this.env);
  }

  private cacheKey(serverId: string, projectId: string): string {
    return `${serverId}:${projectId}`;
  }

  async discoverCapabilities(
    serverId: string,
    projectId: string,
    force = false,
  ): Promise<McpCapabilitySnapshot> {
    const server = this.registry.get(serverId);
    const probe = evaluateMcpPolicy({
      server,
      projectId,
      toolName: server.allowedToolPatterns[0] ?? "list_tools",
      env: this.env,
    });
    if (probe.decision === "deny" && probe.reason.includes("project")) {
      throw new Error(probe.reason);
    }
    if (!this.registry.isConfigured(serverId, this.env)) {
      throw new Error(`MCP server ${serverId} is not configured`);
    }

    const key = this.cacheKey(serverId, projectId);
    const cached = this.cache.get(key);
    if (!force && cached && Date.parse(cached.expiresAt) > Date.now()) return cached;

    const client = new McpHttpClient(server, this.env);
    await client.initialize();
    const tools = await client.listTools();
    const discoveredAt = new Date();
    const snapshot: McpCapabilitySnapshot = {
      serverId,
      projectId,
      tools,
      discoveredAt: discoveredAt.toISOString(),
      expiresAt: new Date(discoveredAt.getTime() + CAPABILITY_CACHE_MS).toISOString(),
    };
    this.cache.set(key, snapshot);
    return snapshot;
  }

  async preview(request: McpInvocationRequest): Promise<{
    policy: McpPolicyResult;
    discovered: boolean;
    evidenceId: string;
  }> {
    assertNoSecretArguments(request.arguments);
    const server = this.registry.get(request.serverId);
    const policy = evaluateMcpPolicy({
      server,
      projectId: request.projectId,
      toolName: request.toolName,
      env: this.env,
    });
    const hash = requestHash({
      serverId: request.serverId,
      projectId: request.projectId,
      toolName: request.toolName,
      arguments: request.arguments,
    });
    const evidenceId = await writeEvidence({
      projectId: request.projectId,
      missionId: request.missionId,
      approvalId: request.approvalId,
      serverId: request.serverId,
      toolName: request.toolName,
      risk: policy.risk,
      policyDecision: policy.decision,
      status: policy.decision === "allow" ? "previewed" : "blocked",
      requestHash: hash,
      requestSummary: summarizeRequest(request),
      estimatedCostUsd: 0,
    });

    return {
      policy,
      discovered: false,
      evidenceId,
    };
  }

  async invoke(request: McpInvocationRequest): Promise<McpInvocationResult> {
    assertNoSecretArguments(request.arguments);
    const server = this.registry.get(request.serverId);
    const policy = evaluateMcpPolicy({
      server,
      projectId: request.projectId,
      toolName: request.toolName,
      env: this.env,
    });
    const hash = requestHash({
      serverId: request.serverId,
      projectId: request.projectId,
      toolName: request.toolName,
      arguments: request.arguments,
    });

    if (policy.decision !== "allow") {
      const evidenceId = await writeEvidence({
        projectId: request.projectId,
        missionId: request.missionId,
        approvalId: request.approvalId,
        serverId: request.serverId,
        toolName: request.toolName,
        risk: policy.risk,
        policyDecision: policy.decision,
        status: "blocked",
        requestHash: hash,
        requestSummary: summarizeRequest(request),
        estimatedCostUsd: 0,
      });
      throw new Error(`MCP invocation blocked (${evidenceId}): ${policy.reason}`);
    }

    const started = Date.now();
    try {
      const capabilities = await this.discoverCapabilities(
        request.serverId,
        request.projectId,
      );
      const tool = capabilities.tools.find((candidate) => candidate.name === request.toolName);
      if (!tool) throw new Error(`Tool ${request.toolName} was not advertised by ${request.serverId}`);

      const client = new McpHttpClient(server, this.env);
      const result = await client.callTool(request.toolName, request.arguments);
      const durationMs = Date.now() - started;
      const evidenceId = await writeEvidence({
        projectId: request.projectId,
        missionId: request.missionId,
        approvalId: request.approvalId,
        serverId: request.serverId,
        toolName: request.toolName,
        risk: policy.risk,
        policyDecision: policy.decision,
        status: "passed",
        requestHash: hash,
        requestSummary: summarizeRequest(request),
        responseSummary: summarizeResponse(result),
        durationMs,
        estimatedCostUsd: 0,
      });

      return {
        serverId: request.serverId,
        projectId: request.projectId,
        toolName: request.toolName,
        policy,
        durationMs,
        result,
        evidenceId,
      };
    } catch (error) {
      const durationMs = Date.now() - started;
      const message = error instanceof Error ? error.message : String(error);
      await writeEvidence({
        projectId: request.projectId,
        missionId: request.missionId,
        approvalId: request.approvalId,
        serverId: request.serverId,
        toolName: request.toolName,
        risk: policy.risk,
        policyDecision: policy.decision,
        status: "failed",
        requestHash: hash,
        requestSummary: summarizeRequest(request),
        responseSummary: { errorType: error instanceof Error ? error.name : typeof error },
        durationMs,
        estimatedCostUsd: 0,
        errorCode: requestHash(message).slice(0, 16),
      });
      throw error;
    }
  }
}

export function advertisedToolNames(tools: McpToolDefinition[]): string[] {
  return tools.map((tool) => tool.name).sort();
}
