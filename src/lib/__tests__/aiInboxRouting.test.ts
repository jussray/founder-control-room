import { describe, expect, it, vi } from 'vitest';
import { reconcileGithubInboxMessage } from '../githubInboxReconciliation.js';
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

describe('GitHub notification reconciliation', () => {
  const github = { ...base, from: 'GitHub <notifications@github.com>', automated: true };
  it.each([
    '[GitHub] We had a problem billing your account',
    '[GitHub] A third-party OAuth application has been added to your account',
  ])('escalates account-level notices: %s', subject => {
    const decision = classifyAiInboxMessage({ ...github, subject });
    expect(decision.lane).toBe('money_security');
    expect(decision.requiresHumanReview).toBe(true);
    expect(decision.evidence).toBe('message_only');
  });
  it.each(['failed', 'cancelled', 'skipped', 'succeeded'])('reconciles %s runs against current provider state', conclusion => {
    const decision = classifyAiInboxMessage({ ...github, subject: '[example/repo] PR run ' + conclusion + ': Verify' });
    expect(decision.lane).toBe('ci_unverified');
    expect(decision.requiresHumanReview).toBe(true);
    expect(decision.evidence).toBe('message_only');
  });
  it('holds PR conversation updates for reconciliation even when automated', () => {
    const decision = classifyAiInboxMessage({ ...github, subject: 'Re: [example/repo] Fix build (PR #12)' });
    expect(decision.lane).toBe('project_updates');
    expect(decision.requiresHumanReview).toBe(true);
    expect(decision.evidence).toBe('message_only');
  });
  it('does not elevate a spoofed GitHub sender on a success notice', () => {
    const decision = classifyAiInboxMessage({ ...github, from: 'notifications@github.com.example.org', subject: '[example/repo] Run succeeded: Verify' });
    expect(decision.lane).toBe('automated_notice');
  });
});

describe('scoped GitHub inbox provider readback', () => {
  const project = { id: 'p1', slug: 'alpha', repo_provider: 'github', repo_identifier: 'example/alpha', status: 'active', verification_enabled: true };
  const head = '123abcd' + '0'.repeat(33);
  const other = '987abcd' + '0'.repeat(33);
  const message = { ...base, projectSlug: 'alpha', from: 'GitHub <notifications@github.com>', subject: '[example/alpha] Run succeeded: Verify - main (123abcd)' };
  const reader = () => ({
    resolveRef: vi.fn(async () => head),
    listVerificationSignals: vi.fn(async () => [{ id: '1', name: 'Verify', commitSha: head, status: 'passed' as const, provider: 'github' }]),
    observePullRequest: vi.fn(async () => ({ number: 12, repository: 'example/alpha', headRepository: 'example/alpha', baseRef: 'main', headRef: 'fix', baseSha: other, headSha: head, authorIdentity: 'fixture', state: 'open' as const, draft: false, merged: false })),
    listReviewSignals: vi.fn(async () => []),
  });
  it('rejects a different repository or mailbox project without invoking the provider', async () => {
    const make = vi.fn(reader);
    for (const m of [{ ...message, subject: '[example/beta] Run succeeded: Verify - main (123abcd)' }, { ...message, projectSlug: 'beta' }]) {
      expect((await reconcileGithubInboxMessage(m, project, make))?.status).toBe('blocked');
    }
    expect(make).not.toHaveBeenCalled();
  });
  it('does not trust sender suffix spoofing or non-GitHub subjects', async () => {
    const make = vi.fn(reader);
    expect(await reconcileGithubInboxMessage({ ...message, from: 'notifications@github.com.evil.example' }, project, make)).toBeNull();
    expect(make).not.toHaveBeenCalled();
  });
  it('observes current checks without treating a successful email as incident closure', async () => {
    const provider = reader();
    const result = await reconcileGithubInboxMessage(message, project, () => provider);
    expect(result).toMatchObject({ status: 'observed', headSha: head, checkCounts: { passed: 1 }, resolution: 'unverified' });
    expect(provider.listVerificationSignals).toHaveBeenCalledWith('alpha', head);
    expect(JSON.stringify(result)).not.toContain(message.accountId);
    expect(JSON.stringify(result)).not.toContain(message.providerMessageId);
  });
  it('holds stale notifications and ambiguous PR run subjects without claiming green', async () => {
    const provider = reader();
    const make = vi.fn(() => provider);
    expect((await reconcileGithubInboxMessage({ ...message, subject: '[example/alpha] Run succeeded: Verify - main (987abcd)' }, project, make))?.status).toBe('stale');
    expect(provider.listVerificationSignals).not.toHaveBeenCalled();
    expect((await reconcileGithubInboxMessage({ ...message, subject: '[example/alpha] PR run failed: Verify - Fix issue (123abcd)' }, project, make))?.status).toBe('blocked');
    expect(make).toHaveBeenCalledTimes(1);
  });
  it('reads explicit PR identity, checks and review signals without merge authority', async () => {
    const provider = reader();
    const result = await reconcileGithubInboxMessage({ ...message, subject: 'Re: [example/alpha] Fix issue (PR #12)' }, project, () => provider);
    expect(result).toMatchObject({ status: 'observed', prNumber: 12, prState: 'open', resolution: 'unverified', reviewCounts: {} });
    expect(provider.observePullRequest).toHaveBeenCalledTimes(2);
  });
  it('rejects movement during readback and mixed-head provider signals', async () => {
    const provider = reader();
    provider.resolveRef.mockResolvedValueOnce(head).mockResolvedValueOnce(other);
    expect((await reconcileGithubInboxMessage(message, project, () => provider))?.status).toBe('stale');
    const mixed = reader();
    mixed.listVerificationSignals.mockResolvedValueOnce([{ id: '1', name: 'Verify', commitSha: other, status: 'passed', provider: 'github' }]);
    expect((await reconcileGithubInboxMessage(message, project, () => mixed))?.status).toBe('blocked');
  });
  it('redacts provider exceptions and never treats them as successful readback', async () => {
    const provider = reader();
    provider.resolveRef.mockRejectedValueOnce(new Error('private provider detail'));
    const result = await reconcileGithubInboxMessage(message, project, () => provider);
    expect(result).toMatchObject({ status: 'blocked', reason: 'provider_read_failed', resolution: 'unverified' });
    expect(JSON.stringify(result)).not.toContain('private provider detail');
  });
});
