import { describe, expect, it } from 'vitest';
import { validateAuthorityEnvelope } from '../authorityKernel.js';
import { issueCreateBranchAuthority } from '../authorityIssuance.js';

const NOW = '2026-09-11T08:00:00.000Z';

function issue() {
  return issueCreateBranchAuthority({
    missionId: 'mission-123',
    projectId: 'project-456',
    actor: 'founder@example.com',
    approvedBy: 'founder@example.com',
    idempotencyKey: 'idem-789',
    baseRef: 'main',
    branchName: 'mission/mission-1',
    state: { missionStatus: 'proposed', policySnapshot: { required: ['ci'] } },
    proof: { id: 'proof-1', gateId: 'create_branch', createdAt: NOW },
    now: NOW,
    toolCallId: 'tool-call-1',
  });
}

describe('issueCreateBranchAuthority', () => {
  it('derives a valid exact-action envelope entirely on the server', () => {
    const issued = issue();
    expect(issued.envelope.capability.id).toBe('github.repository.create-branch');
    expect(issued.envelope.consequenceClass).toBe('reversible');
    expect(issued.envelope.idempotencyKey).toBe('idem-789');
    expect(validateAuthorityEnvelope(issued.envelope, issued.context)).toEqual([]);
  });

  it('derives deterministic fallback issuance from proof and idempotency identity', () => {
    const issued = issueCreateBranchAuthority({
      missionId: 'mission-123',
      projectId: 'project-456',
      actor: 'founder@example.com',
      approvedBy: 'founder@example.com',
      idempotencyKey: 'idem-789',
      baseRef: 'main',
      branchName: 'mission/mission-1',
      state: { missionStatus: 'proposed', policySnapshot: { required: ['ci'] } },
      proof: { id: 'proof-1', gateId: 'create_branch', createdAt: NOW },
    });

    expect(issued.envelope.issuedAt).toBe(NOW);
    expect(issued.envelope.expiresAt).toBe('2026-09-11T08:15:00.000Z');
    expect(issued.envelope.toolCallId).toBe('approval-execution:idem-789');
    expect(validateAuthorityEnvelope(issued.envelope, issued.context)).toEqual([]);
  });

  it('rejects changed arguments at execution time', () => {
    const issued = issue();
    expect(validateAuthorityEnvelope(issued.envelope, {
      ...issued.context,
      argumentsHash: 'a'.repeat(64),
    })).toContain('tool arguments changed after approval');
  });

  it('rejects changed observed state at execution time', () => {
    const issued = issue();
    expect(validateAuthorityEnvelope(issued.envelope, {
      ...issued.context,
      stateFingerprint: 'b'.repeat(64),
    })).toContain('execution state changed after approval');
  });

  it('rejects execution after the authority expires', () => {
    const issued = issue();
    expect(validateAuthorityEnvelope(issued.envelope, {
      ...issued.context,
      now: '2026-09-11T08:16:00.000Z',
    })).toContain('authority envelope is expired');
  });

  it('will not mint branch authority from another proof gate', () => {
    expect(() => issueCreateBranchAuthority({
      missionId: 'mission-123',
      projectId: 'project-456',
      actor: 'founder@example.com',
      approvedBy: 'founder@example.com',
      idempotencyKey: 'idem-789',
      baseRef: 'main',
      branchName: 'mission/mission-1',
      state: { missionStatus: 'proposed', policySnapshot: null },
      proof: { id: 'proof-1', gateId: 'merge', createdAt: NOW },
      now: NOW,
    })).toThrow('create_branch authority requires create_branch proof');
  });
});
