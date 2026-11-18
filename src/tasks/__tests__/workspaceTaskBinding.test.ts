import { describe, expect, it } from 'vitest';
import { bindWorkspaceTask, type WorkspaceTaskBindingInput } from '../workspaceTaskBinding.js';

const id = {
  user: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  other: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  tenant: '11111111-1111-4111-8111-111111111111',
  foreign: '22222222-2222-4222-8222-222222222222',
  project: '33333333-3333-4333-8333-333333333333',
  task: '44444444-4444-4444-8444-444444444444',
  lease: '55555555-5555-4555-8555-555555555555',
};

function fixture(): WorkspaceTaskBindingInput {
  return {
    now: '2026-11-18T12:00:00.000Z',
    identity: { userId: id.user, workspaceId: id.tenant, membership: 'active', verified: true },
    task: { id: id.task, workspaceId: id.tenant, ownerUserId: id.user,
      projectId: id.project, capabilityId: 'public-web-observation-v1',
      state: 'enabled', cadenceMinutes: 60, dueAt: '2026-11-18T11:00:00.000Z' },
    grant: { taskId: id.task, workspaceId: id.tenant, ownerUserId: id.user,
      projectId: id.project, capabilityId: 'public-web-observation-v1',
      scope: 'READ', state: 'active', expiresAt: '2026-11-18T12:30:00.000Z' },
    claim: { taskId: id.task, workspaceId: id.tenant, id: id.lease,
      claimedAt: '2026-11-18T11:59:00.000Z', expiresAt: '2026-11-18T12:05:00.000Z' },
    project: { id: id.project, workspaceId: id.tenant },
  };
}

describe('native FCR workspace task boundary', () => {
  it('accepts one live owner-scoped read-only claim without claiming provider execution', () => {
    const result = bindWorkspaceTask(fixture());
    expect(result).toMatchObject({ status: 'READY_FOR_EXISTING_RUNTIME',
      consequence: 'READ', providerExecuted: false, runtimeVerified: false,
      taskId: id.task, workspaceId: id.tenant });
    if (result.status === 'READY_FOR_EXISTING_RUNTIME') {
      expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(JSON.stringify(result)).not.toContain('email');
  });

  it('blocks another owner even inside the same tenant', () => {
    const value = fixture();
    value.identity.userId = id.other;
    expect(bindWorkspaceTask(value)).toEqual({ status: 'BLOCKED', reason: 'tenant_or_owner_mismatch' });
  });

  it('blocks cross-tenant project and lease bindings', () => {
    const project = fixture();
    project.project.workspaceId = id.foreign;
    expect(bindWorkspaceTask(project).status).toBe('BLOCKED');
    const lease = fixture();
    lease.claim.workspaceId = id.foreign;
    expect(bindWorkspaceTask(lease).status).toBe('BLOCKED');
  });

  it('blocks revoked or unverified membership, paused tasks, and revoked grants', () => {
    const revoked = fixture();
    revoked.identity.membership = 'revoked';
    expect(bindWorkspaceTask(revoked).status).toBe('BLOCKED');
    const unverified = fixture();
    unverified.identity.verified = false;
    expect(bindWorkspaceTask(unverified).status).toBe('BLOCKED');
    const paused = fixture();
    paused.task.state = 'paused';
    expect(bindWorkspaceTask(paused).status).toBe('BLOCKED');
    const grant = fixture();
    grant.grant.state = 'revoked';
    expect(bindWorkspaceTask(grant).status).toBe('BLOCKED');
  });

  it('rejects escalating capability or permission from read-only', () => {
    const mutation = fixture();
    mutation.grant.scope = 'WRITE';
    expect(bindWorkspaceTask(mutation).status).toBe('BLOCKED');
    const capability = fixture();
    capability.task.capabilityId = 'github.merge';
    capability.grant.capabilityId = 'github.merge';
    expect(bindWorkspaceTask(capability).status).toBe('BLOCKED');
  });

  it('does not dispatch future work, expired claims, or expired grants', () => {
    const future = fixture();
    future.task.dueAt = '2026-11-18T13:00:00.000Z';
    expect(bindWorkspaceTask(future).status).toBe('BLOCKED');
    const claim = fixture();
    claim.claim.expiresAt = '2026-11-18T11:59:00.000Z';
    expect(bindWorkspaceTask(claim).status).toBe('BLOCKED');
    const grant = fixture();
    grant.grant.expiresAt = '2026-11-18T11:59:00.000Z';
    expect(bindWorkspaceTask(grant).status).toBe('BLOCKED');
  });

  it('enforces the hourly floor and binds provenance to the lease', () => {
    const tooOften = fixture();
    tooOften.task.cadenceMinutes = 5;
    expect(bindWorkspaceTask(tooOften).status).toBe('BLOCKED');
    const first = bindWorkspaceTask(fixture());
    const secondInput = fixture();
    secondInput.claim.id = '66666666-6666-4666-8666-666666666666';
    const second = bindWorkspaceTask(secondInput);
    expect(first.status).toBe('READY_FOR_EXISTING_RUNTIME');
    expect(second.status).toBe('READY_FOR_EXISTING_RUNTIME');
    if (first.status === 'READY_FOR_EXISTING_RUNTIME'
      && second.status === 'READY_FOR_EXISTING_RUNTIME') {
      expect(first.fingerprint).not.toBe(second.fingerprint);
    }
  });
});
