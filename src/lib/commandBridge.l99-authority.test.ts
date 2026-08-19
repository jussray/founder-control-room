import { describe, expect, it } from 'vitest';
import { executionPayloadForRequest } from './commandBridge.js';

describe('Command Bridge L99 authority boundary', () => {
  it('does not manufacture confirmWrite for an approved write-risk card', () => {
    const payload = executionPayloadForRequest({
      projectSlug: 'untold-stories',
      missionId: 'mission-uuid',
      commandId: 'deps.install',
      expectedCommitSha: 'a'.repeat(40),
      risk: 'write',
    });

    expect(payload.endpoint).toBe('/terminal/untold-stories/run');
    expect(payload.method).toBe('POST');
    expect(payload.body).toEqual({
      missionId: 'mission-uuid',
      commandId: 'deps.install',
      expectedCommitSha: 'a'.repeat(40),
    });
    expect(payload.body).not.toHaveProperty('confirmWrite');
  });
});
