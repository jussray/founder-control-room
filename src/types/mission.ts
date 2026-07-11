/**
 * Mission Engine types — mirrors `missions`, `agent_runs`,
 * `council_conversations` in Supabase.
 */

export type MissionStatus =
  | "proposed"
  | "sandboxed"
  | "in_review"
  | "approved"
  | "integrated"
  | "deployed"
  | "rejected"
  | "rolled_back";

export interface Mission {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: MissionStatus;
  baseRef?: string;
  branchRef?: string;
  builderAgent?: string; // e.g. "codex", "claude-code", "cursor"
  reviewerAgent?: string;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "pending" | "running" | "passed" | "failed";

/**
 * Runner result — the CI-evidence contract. The agent's claim is not
 * evidence; this record is.
 */
export interface AgentRun {
  id: string;
  missionId: string;
  changeProposalId?: string;
  runnerProfile?: string; // e.g. "bip-default"
  checks: Record<string, "passed" | "failed" | "not_run">;
  status: RunStatus;
  artifactIds: string[];
  startedAt: string;
  finishedAt?: string;
}

export interface CouncilConversation {
  id: string;
  missionId: string;
  round: number;
  participants: string[]; // e.g. ["codex", "claude", "redteam"]
  transcript?: unknown;
  outcome?: string;
  createdAt: string;
}

export type GatedAction =
  | "create_sandbox_workspace"
  | "create_branch"
  | "integrate"
  | "deploy"
  | "rollback";

/**
 * L99 authority model: every gated action requires its own approval row.
 * No approval carries forward to the next step.
 */
export interface Approval {
  id: string;
  missionId?: string;
  changeProposalId?: string;
  action: GatedAction;
  decision: "approved" | "denied";
  decidedBy: string; // "founder"
  decidedAt: string;
  notes?: string;
}
