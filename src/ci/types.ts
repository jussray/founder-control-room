import type { TerminalRunStatus } from '../terminal/types.js';

export type CiAuthorityState = 'pending' | 'pass' | 'fail' | 'blocked';

export interface CiRequirement {
  commandId: string;
  label: string;
  critical: true;
}

export interface PortfolioCiPolicy {
  projectSlug: string;
  version: string;
  mirrorContext: string;
  requirements: readonly CiRequirement[];
}

export interface CiRunEvidence {
  runId: string;
  commandId: string;
  status: TerminalRunStatus;
  observedCommitSha: string;
  finishedAt: string;
  outputTruncated: boolean;
}

export interface ControlRoomCiAttestation {
  projectSlug: string;
  policyVersion: string;
  commitSha: string;
  state: CiAuthorityState;
  summary: string;
  mirrorContext: string;
  authority: 'founder-control-room';
  evidence: readonly CiRunEvidence[];
  missingCommandIds: readonly string[];
  failedCommandIds: readonly string[];
  blockedReasons: readonly string[];
  createdAt: string;
}

export type GitHubCommitStatusState = 'pending' | 'success' | 'failure' | 'error';

export interface GitHubStatusMirrorPayload {
  projectSlug: string;
  commitSha: string;
  state: GitHubCommitStatusState;
  context: string;
  description: string;
  targetUrl?: string;
}
