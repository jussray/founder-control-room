export type McpRisk =
  | "read"
  | "write"
  | "destructive"
  | "external_side_effect";

export type McpPolicyDecision = "allow" | "deny" | "requires_approval";

export interface McpServerDefinition {
  id: string;
  label: string;
  role: string;
  endpointEnv: string;
  authTokenEnv?: string;
  enabledProjects: string[];
  allowedToolPatterns: string[];
  deniedToolPatterns: string[];
  defaultRisk: McpRisk;
  developmentOnly?: boolean;
  monthlyBudgetUsd: number;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpCapabilitySnapshot {
  serverId: string;
  projectId: string;
  tools: McpToolDefinition[];
  discoveredAt: string;
  expiresAt: string;
}

export interface McpInvocationRequest {
  serverId: string;
  projectId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  missionId?: string;
  approvalId?: string;
}

export interface McpPolicyResult {
  decision: McpPolicyDecision;
  risk: McpRisk;
  reason: string;
}

export interface McpInvocationResult {
  serverId: string;
  projectId: string;
  toolName: string;
  policy: McpPolicyResult;
  durationMs: number;
  result: unknown;
  evidenceId: string;
}

export interface McpEvidenceInput {
  projectId: string;
  missionId?: string;
  approvalId?: string;
  serverId: string;
  toolName: string;
  risk: McpRisk;
  policyDecision: McpPolicyDecision;
  status: "previewed" | "passed" | "blocked" | "failed";
  requestHash: string;
  requestSummary: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
  durationMs?: number;
  estimatedCostUsd?: number;
  errorCode?: string;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
