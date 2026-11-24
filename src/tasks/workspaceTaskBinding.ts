/**
 * FCR workspace task boundary. These checks are NOT a new approval engine:
 * a caller must resolve identity, grant, claim and project from trusted FCR
 * state before invoking the existing capability runtime.
 */
import { createHash } from 'node:crypto';

export const WORKSPACE_TASK_BINDING = 'fcr/workspace-task-binding@v1' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_ONLY_CAPABILITIES = new Set(['public-web-observation-v1']);

type Identity = { userId: string; workspaceId: string; membership: 'active' | 'revoked'; verified: boolean };
type Task = { id: string; workspaceId: string; ownerUserId: string; projectId: string;
  capabilityId: string; state: 'enabled' | 'paused'; cadenceMinutes: number; dueAt: string };
type Grant = { taskId: string; workspaceId: string; ownerUserId: string; projectId: string;
  capabilityId: string; scope: 'READ' | 'WRITE'; state: 'active' | 'revoked'; expiresAt: string };
type Claim = { taskId: string; workspaceId: string; id: string; claimedAt: string; expiresAt: string };

export type WorkspaceTaskBindingInput = Readonly<{
  identity: Identity; task: Task; grant: Grant; claim: Claim;
  project: { id: string; workspaceId: string }; now: string;
}>;

export type WorkspaceTaskBindingResult =
  | { status: 'BLOCKED'; reason: string }
  | { status: 'READY_FOR_EXISTING_RUNTIME'; contract: typeof WORKSPACE_TASK_BINDING;
    taskId: string; workspaceId: string; ownerUserId: string; projectId: string;
    capabilityId: 'public-web-observation-v1'; leaseId: string; fingerprint: string;
    consequence: 'READ'; providerExecuted: false; runtimeVerified: false };

function iso(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

/** Prepare a task for FCR's existing read-only runtime, never execute it. */
export function bindWorkspaceTask(input: WorkspaceTaskBindingInput): WorkspaceTaskBindingResult {
  const blocked = (reason: string): WorkspaceTaskBindingResult => ({ status: 'BLOCKED', reason });
  if (!input?.identity || !input.task || !input.grant || !input.claim || !input.project) {
    return blocked('missing_trusted_state');
  }
  const { identity: user, task, grant, claim, project } = input;
  if ([user.userId, user.workspaceId, task.id, task.workspaceId, task.ownerUserId,
    task.projectId, grant.taskId, grant.workspaceId, grant.ownerUserId, grant.projectId,
    claim.taskId, claim.workspaceId, claim.id, project.id, project.workspaceId].some(v =>
      typeof v !== 'string' || !UUID.test(v))) return blocked('malformed_identity_or_claim');
  if (!user.verified || user.membership !== 'active') return blocked('membership_unverified');
  if (user.userId !== task.ownerUserId || user.workspaceId !== task.workspaceId ||
      task.workspaceId !== grant.workspaceId || task.workspaceId !== claim.workspaceId ||
      task.workspaceId !== project.workspaceId || task.id !== grant.taskId ||
      task.id !== claim.taskId || task.ownerUserId !== grant.ownerUserId ||
      task.projectId !== grant.projectId || task.projectId !== project.id) {
    return blocked('tenant_or_owner_mismatch');
  }
  if (task.state !== 'enabled' || grant.state !== 'active') return blocked('task_or_grant_disabled');
  if (grant.scope !== 'READ' || !READ_ONLY_CAPABILITIES.has(task.capabilityId) ||
      task.capabilityId !== grant.capabilityId) return blocked('unapproved_capability_or_scope');
  if (!Number.isInteger(task.cadenceMinutes) || task.cadenceMinutes < 60 ||
      task.cadenceMinutes > 10080) return blocked('invalid_cadence');
  const now = iso(input.now), due = iso(task.dueAt), granted = iso(grant.expiresAt);
  const claimed = iso(claim.claimedAt), expires = iso(claim.expiresAt);
  if (now === null || due === null || granted === null || claimed === null || expires === null ||
      due > now || claimed > now || granted <= now || expires <= now || expires <= claimed) {
    return blocked('not_due_or_stale_claim');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([
    WORKSPACE_TASK_BINDING, user.userId, task.workspaceId, task.id,
    task.projectId, task.capabilityId, claim.id, claim.claimedAt,
  ])).digest('hex');
  return { status: 'READY_FOR_EXISTING_RUNTIME', contract: WORKSPACE_TASK_BINDING,
    taskId: task.id, workspaceId: task.workspaceId, ownerUserId: user.userId,
    projectId: task.projectId, capabilityId: 'public-web-observation-v1',
    leaseId: claim.id, fingerprint, consequence: 'READ',
    providerExecuted: false, runtimeVerified: false };
}
