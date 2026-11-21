import { describe, expect, it } from 'vitest';
import { assertScheduledTaskResults } from '../scheduledTaskResults.js';

describe('scheduled task result propagation', () => {
  it('accepts all-fulfilled scheduled work', () => {
    expect(() => assertScheduledTaskResults([
      { name: 'reconciler', result: { status: 'fulfilled', value: undefined } },
      { name: 'external-use', result: { status: 'fulfilled', value: { status: 'sent' } } },
    ])).not.toThrow();
  });

  it('surfaces a later task rejection instead of silently discarding it', () => {
    const externalUseFailure = new Error('external-use failed');

    expect(() => assertScheduledTaskResults([
      { name: 'reconciler', result: { status: 'fulfilled', value: undefined } },
      { name: 'external-use', result: { status: 'rejected', reason: externalUseFailure } },
    ])).toThrow(externalUseFailure);
  });

  it('surfaces a fulfilled task that reports a failed outcome', () => {
    expect(() => assertScheduledTaskResults([
      { name: 'reconciler', result: { status: 'fulfilled', value: undefined } },
      { name: 'external-use', result: { status: 'fulfilled', value: { status: 'failed' } } },
    ])).toThrow('scheduled_task_reported_failed:external-use');
  });
});
