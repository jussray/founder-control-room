import { describe, expect, it } from 'vitest';
import { classifyAiInboxMessage, deduplicateAiInboxMessages } from '../aiInboxRouting.js';

const base = {
  accountId: 'founder@example.com',
  providerMessageId: 'message-1',
  subject: 'Regular update',
  receivedAt: '2026-10-08T14:00:00Z',
};

describe('AI Inbox observation-only routing', () => {
  it('prioritizes payment alerts without claiming verification', () => {
    const decision = classifyAiInboxMessage({ ...base, subject: 'Payment failed for invoice' });
    expect(decision.lane).toBe('money_security');
    expect(decision.evidence).toBe('message_only');
    expect(decision.requiresHumanReview).toBe(true);
  });
  it('does not claim a current CI failure from a notification', () => {
    const decision = classifyAiInboxMessage({ ...base, subject: 'Run failed: required gate' });
    expect(decision.lane).toBe('ci_unverified');
    expect(decision.requiresHumanReview).toBe(true);
  });
  it('deduplicates the same provider message within an account', () => {
    expect(deduplicateAiInboxMessages([base, base])).toHaveLength(1);
  });
  it('does not merge messages across accounts', () => {
    expect(deduplicateAiInboxMessages([base, { ...base, accountId: 'bip@example.com' }])).toHaveLength(2);
  });
  it('rejects missing provider identity and invalid dates', () => {
    expect(() => classifyAiInboxMessage({ ...base, accountId: '' })).toThrow('AI_INBOX_INVALID_PROVIDER_IDENTITY');
    expect(() => classifyAiInboxMessage({ ...base, receivedAt: 'not-a-date' })).toThrow('AI_INBOX_INVALID_RECEIVED_AT');
  });
  it('preserves project identity and never dispatches or mutates provider messages', () => {
    const decision = classifyAiInboxMessage({ ...base, projectId: 'jbh' });
    expect(decision.projectId).toBe('jbh');
    expect(decision).not.toHaveProperty('dispatch');
    expect(decision).not.toHaveProperty('archive');
  });
});
