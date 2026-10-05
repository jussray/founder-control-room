import { describe, expect, it } from 'vitest';
import { throwFirstRejectedScheduledTask } from '../scheduledTaskResults.js';

describe('scheduled task result propagation', () => {
  it('accepts all-fulfilled scheduled work', () => {
    expect(() => throwFirstRejectedScheduledTask([
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
    ])).not.toThrow();
  });

  it('surfaces a later task rejection instead of silently discarding it', () => {
    const externalUseFailure = new Error('external-use failed');

    expect(() => throwFirstRejectedScheduledTask([
      { status: 'fulfilled', value: undefined },
      { status: 'rejected', reason: externalUseFailure },
    ])).toThrow(externalUseFailure);
  });
});
