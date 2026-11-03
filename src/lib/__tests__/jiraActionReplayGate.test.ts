import { describe, expect, it } from 'vitest';
import { decideJiraAction } from '../jiraActionReplayGate.js';

describe('FCR Jira action replay gate', () => {
  it('requires an atomic durable claim before the first write', () => {
    expect(decideJiraAction('absent')).toBe('claim-atomically');
  });

  it.each(['claimed', 'provider-accepted', 'outcome-unknown'] as const)(
    'does not replay a Jira write in %s state',
    (state) => expect(decideJiraAction(state)).toBe('verify-provider-state'),
  );

  it('does not repeat a verified mutation', () => {
    expect(decideJiraAction('verified')).toBe('already-verified');
  });

  it('does not execute a denied action', () => {
    expect(decideJiraAction('denied')).toBe('stop');
  });
});
