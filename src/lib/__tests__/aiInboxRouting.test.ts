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
  it('prioritizes frozen store and HSTS security notices without claiming provider verification', () => {
    for (const subject of ['Urgent: JBH is frozen', '[Alert] Domains without HSTS']) {
      const decision = classifyAiInboxMessage({ ...base, subject, replySignal: true });
      expect(decision.lane).toBe('money_security');
      expect(decision.evidence).toBe('message_only');
      expect(decision.requiresHumanReview).toBe(true);
    }
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


describe('AI Inbox response safety triage', () => {
  it('holds possible human replies for review without claiming substantive response', () => {
    const decision = classifyAiInboxMessage({ ...base, replySignal: true, subject: 'Re: Business proposal' });
    expect(decision.lane).toBe('reply_candidate');
    expect(decision.requiresHumanReview).toBe(true);
    expect(decision.evidence).toBe('message_only');
  });
  it('routes unsubscribe signals before any possible reply classification', () => {
    const decision = classifyAiInboxMessage({ ...base, replySignal: true, subject: 'Please unsubscribe' });
    expect(decision.lane).toBe('suppression_review');
    expect(decision.requiresHumanReview).toBe(true);
  });
  it('does not treat an automated notice as a substantive buyer or government reply', () => {
    const decision = classifyAiInboxMessage({ ...base, replySignal: true, automated: true, subject: 'Re: Your request' });
    expect(decision.lane).toBe('automated_notice');
    expect(decision.requiresHumanReview).toBe(false);
  });
  it('preserves explicit project routing but does not infer another brand from subject text', () => {
    const decision = classifyAiInboxMessage({ ...base, projectSlug: 'jbh-private', subject: 'Se’kret Bip investor question' });
    expect(decision.projectSlug).toBe('jbh-private');
    expect(decision.projectId).toBeNull();
    expect(decision.lane).toBe('review');
  });
});
