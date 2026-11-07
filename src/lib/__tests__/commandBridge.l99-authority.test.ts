import { describe, expect, it } from 'vitest';

import { executionPayloadForRequest } from '../commandBridge.js';

describe('Command Bridge authority boundary', () => {
  it('does not convert write approval into direct terminal execution authority', () => {
    const payload = executionPayloadForRequest({
      projectSlug: 'untold-stories',
      missionId: 'mission-1',
      commandId: 'deps.install',
      expectedCommitSha: 'a'.repeat(40),
      risk: 'write',
    });

    expect(payload.endpoint).toBeNull();
    expect(payload.authorityRequired).toBe('L99_APPROVAL_RECEIPT');
    expect(payload.body).not.toHaveProperty('confirmWrite');
  });

  it('does not treat repository-defined verify commands as read-only authority', () => {
    const payload = executionPayloadForRequest({
      projectSlug: 'untold-stories',
      missionId: 'mission-1',
      commandId: 'verify.playwright',
      expectedCommitSha: 'a'.repeat(40),
      risk: 'verify',
    });

    expect(payload.endpoint).toBeNull();
    expect(payload.authorityRequired).toBe('L99_APPROVAL_RECEIPT');
  });

  it('preserves direct routing only for read-risk commands', () => {
    const payload = executionPayloadForRequest({
      projectSlug: 'untold-stories',
      missionId: 'mission-1',
      commandId: 'git.status',
      expectedCommitSha: 'a'.repeat(40),
      risk: 'read',
    });

    expect(payload.endpoint).toBe('/terminal/untold-stories/run');
    expect(payload.authorityRequired).toBeNull();
  });
});
