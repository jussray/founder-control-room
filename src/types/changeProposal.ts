import type { Diff } from "../providers/RepositoryProvider.js";

/**
 * Change Proposal — the PR-equivalent, stripped of GitHub branding.
 * Same useful properties: a proposed change, a frozen diff, review
 * comments (via CouncilConversation), test evidence (via AgentRun),
 * approval, and merge/integration history.
 */

export type CiStatus = "not_run" | "running" | "passed" | "failed";

export type FounderDecision =
  | "pending"
  | "approved"
  | "revision_requested"
  | "another_council_round"
  | "rejected";

export interface ChangeProposal {
  id: string;
  missionId: string;
  projectId: string;
  baseCommit: string;
  candidateCommit: string;
  filesChanged: number;
  diffSummary?: Diff;
  ciStatus: CiStatus;
  founderDecision: FounderDecision;
  createdAt: string;
  decidedAt?: string;
}

/** Actions available on a pending Change Proposal. */
export type ChangeProposalAction =
  | "approve_integration"
  | "request_revision"
  | "run_another_council_round"
  | "reject_and_delete_branch";
