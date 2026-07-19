import type { TerminalCommandRisk } from '../terminal/types.js';

export type CommandBridgeRequestStatus =
  | 'requested'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'executed'
  | 'failed'
  | 'audit_incomplete';

export type CommandBridgeRisk = TerminalCommandRisk;

export interface CommandBridgeContract {
  id: string;
  version: string;
  label: string;
  purpose: string;
  maxRequestWindowMinutes: number;
  principles: readonly string[];
  forbiddenPatterns: readonly string[];
}

export interface CommandBridgeRequestSnapshot {
  id: string;
  projectId: string;
  projectSlug: string | null;
  projectName: string | null;
  missionId: string;
  missionTitle: string | null;
  missionStatus: string | null;
  commandId: string;
  expectedCommitSha: string;
  requestingAgent: string;
  requestedBy: string;
  reason: string;
  rollbackPlan: string | null;
  risk: CommandBridgeRisk;
  status: CommandBridgeRequestStatus;
  expiresAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  terminalRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const COMMAND_BRIDGE_MAX_REQUEST_WINDOW_MINUTES = 60;

export const COMMAND_BRIDGE_CONTRACT: CommandBridgeContract = Object.freeze({
  id: 'founder-control-room-command-bridge',
  version: '1.0.0',
  label: 'Founder Command Bridge',
  purpose: 'Agents request power. Founder directs commands. Guarded terminal produces receipts.',
  maxRequestWindowMinutes: COMMAND_BRIDGE_MAX_REQUEST_WINDOW_MINUTES,
  principles: Object.freeze([
    'No live raw shell tunnels for agents.',
    'Every command request is tied to a project, mission, approved command id, and exact expected commit SHA.',
    'The founder can approve, deny, or let a request expire before any terminal execution.',
    'Execution still runs through the guarded terminal allowlist; Command Bridge never expands the command registry.',
    'Write-risk commands require explicit confirmation and are never implied by an agent request.',
    'Every request, approval, denial, and execution link leaves an auditable event or state row.',
  ]),
  forbiddenPatterns: Object.freeze([
    'generic bash shell',
    'permanent agent session',
    'command execution without mission id',
    'command execution without exact expected head SHA',
    'unbounded stdout or stderr',
    'provider or production action without a separate gate',
  ]),
});

export function isCommandBridgeStatus(value: unknown): value is CommandBridgeRequestStatus {
  return typeof value === 'string' && [
    'requested',
    'approved',
    'denied',
    'expired',
    'executed',
    'failed',
    'audit_incomplete',
  ].includes(value);
}

export function commandBridgeSeverityForRisk(risk: CommandBridgeRisk): 'info' | 'warning' {
  return risk === 'write' ? 'warning' : 'info';
}

export function executionPayloadForRequest(request: Pick<CommandBridgeRequestSnapshot, 'projectSlug' | 'missionId' | 'commandId' | 'expectedCommitSha' | 'risk'>) {
  return {
    endpoint: request.projectSlug ? `/terminal/${encodeURIComponent(request.projectSlug)}/run` : null,
    method: 'POST',
    body: {
      missionId: request.missionId,
      commandId: request.commandId,
      expectedCommitSha: request.expectedCommitSha,
      ...(request.risk === 'write' ? { confirmWrite: true } : {}),
    },
  };
}
