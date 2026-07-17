import type { EvidenceKind } from '../reconciliation/types.js';

export type TerminalCommandRisk = 'read' | 'verify' | 'write';
export type TerminalRunStatus =
  | 'running'
  | 'passed'
  | 'failed'
  | 'timed_out'
  | 'cancelled';

export interface TerminalCommandSpec {
  id: string;
  label: string;
  projectSlug: string;
  executable: string;
  args: readonly string[];
  relativeCwd: string;
  risk: TerminalCommandRisk;
  timeoutMs: number;
  maxOutputBytes: number;
  evidenceKind?: EvidenceKind;
  allowedEnvNames?: readonly string[];
}

export interface TerminalRunRequest {
  runId: string;
  projectSlug: string;
  commandId: string;
  expectedCommitSha: string;
}

export interface TerminalRunResult {
  runId: string;
  projectSlug: string;
  commandId: string;
  status: TerminalRunStatus;
  observedCommitSha: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
}

export class TerminalRunnerError extends Error {
  constructor(
    public readonly code:
      | 'UNKNOWN_COMMAND'
      | 'WORKSPACE_NOT_CONFIGURED'
      | 'WORKSPACE_ESCAPE'
      | 'WORKSPACE_MISSING'
      | 'HEAD_MISMATCH'
      | 'INVALID_HEAD_SHA'
      | 'PROJECT_BUSY'
      | 'SPAWN_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'TerminalRunnerError';
  }
}
