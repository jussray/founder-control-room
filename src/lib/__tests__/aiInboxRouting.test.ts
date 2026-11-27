import { describe, expect, it, vi } from 'vitest';
import { reconcileGithubInboxMessage } from '../githubInboxReconciliation.js';
import { runGithubInboxWatch, type GithubInboxWatchEvent } from '../githubInboxWatch.js';
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

describe('durable GitHub inbox watch', () => {
  const project = { id: 'p1', slug: 'alpha', repo_provider: 'github', repo_identifier: 'example/alpha', status: 'active', verification_enabled: true };
  const accountId = 'founder@example.com';
  const labelId = 'Label_github';
  const head = '123abcd' + '0'.repeat(33);
  const message = { ...base, accountId, projectSlug: 'alpha', from: 'notifications@github.com', subject: '[example/alpha] Run failed: Verify - main (123abcd)' };
  const at = new Date('2026-11-27T14:00:00Z');
  function fixture() {
    const ledger = new Map<string, unknown>();
    const reader = {
      resolveRef: vi.fn(async () => head),
      listVerificationSignals: vi.fn(async () => [{ id: '1', name: 'Verify', commitSha: head, status: 'failed' as 'failed' | 'passed', provider: 'github' }]),
    };
    const deps = {
      status: vi.fn(() => ({ configured: true, expectedAccount: accountId, projectSlug: 'alpha', labelId })),
      project: vi.fn(async () => project),
      probe: vi.fn(async () => ({ accountId, projectSlug: 'alpha', labelId })),
      read: vi.fn(async (_options: { maxResults: number; pageToken?: string }) => ({ accountId, projectSlug: 'alpha', messages: [message], nextPageToken: null as string | null })),
      reader: vi.fn(() => reader),
      persist: vi.fn(async (event: GithubInboxWatchEvent) => {
        const isDuplicate = ledger.has(event.providerEventId);
        if (!isDuplicate) ledger.set(event.providerEventId, event);
        return { id: event.providerEventId, isDuplicate };
      }),
    };
    return { deps, ledger, reader };
  }
  it('does not access Gmail or storage while disabled or outside the hourly tick', async () => {
    const { deps } = fixture();
    expect((await runGithubInboxWatch(false, at, deps)).status).toBe('skipped');
    expect((await runGithubInboxWatch(true, new Date('2026-11-27T14:01:00Z'), deps)).status).toBe('skipped');
    expect(deps.status).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it('holds mismatched mailbox identity before any message read', async () => {
    const { deps } = fixture();
    deps.probe.mockResolvedValueOnce({ accountId: 'wrong@example.com', projectSlug: 'alpha', labelId });
    expect((await runGithubInboxWatch(true, at, deps)).status).toBe('blocked');
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it('retains one intake and distinct provider snapshots with no closure or raw mail', async () => {
    const { deps, ledger, reader } = fixture();
    expect(await runGithubInboxWatch(true, at, deps)).toMatchObject({ status: 'observed', inserted: 2, duplicates: 0, coverage: 'bounded_inbox' });
    expect(await runGithubInboxWatch(true, at, deps)).toMatchObject({ inserted: 0, duplicates: 2 });
    reader.listVerificationSignals.mockResolvedValueOnce([{ id: '1', name: 'Verify', commitSha: head, status: 'passed', provider: 'github' }]);
    expect(await runGithubInboxWatch(true, at, deps)).toMatchObject({ inserted: 1, duplicates: 1 });
    expect(ledger.size).toBe(3);
    const stored = JSON.stringify([...ledger.values()]);
    for (const value of [accountId, message.providerMessageId, message.subject, message.from]) expect(stored).not.toContain(value);
    expect([...ledger.values()].every(event => (event as GithubInboxWatchEvent).payload.resolution === 'unverified')).toBe(true);
  });
  it('ignores foreign projects and non-GitHub sender hints', async () => {
    const { deps } = fixture();
    deps.read.mockResolvedValueOnce({ accountId, projectSlug: 'alpha', messages: [
      { ...message, subject: '[example/beta] Run failed: Verify - main (123abcd)' },
      { ...message, from: 'notifications@github.com.evil.example' },
    ], nextPageToken: null });
    expect(await runGithubInboxWatch(true, at, deps)).toMatchObject({ inserted: 0, outOfScope: 2 });
    expect(deps.reader).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it('retains account notices as account review, not a repo failure', async () => {
    const { deps, ledger } = fixture();
    deps.read.mockResolvedValueOnce({ accountId, projectSlug: 'alpha', messages: [{ ...message, subject: '[GitHub] We had a problem billing your account' }], nextPageToken: null });
    expect(await runGithubInboxWatch(true, at, deps)).toMatchObject({ inserted: 1 });
    const event = [...ledger.values()][0] as GithubInboxWatchEvent;
    expect(event.payload).toMatchObject({ scope: 'account', lane: 'money_security', resolution: 'unverified' });
    expect(deps.reader).not.toHaveBeenCalled();
  });
  it('bounds pagination and reports incomplete coverage instead of claiming an empty backlog', async () => {
    const { deps } = fixture();
    deps.read.mockImplementation(async options => ({ accountId, projectSlug: 'alpha', messages: [], nextPageToken: options.pageToken ? options.pageToken + 'a' : 'a' }));
    expect(await runGithubInboxWatch(true, at, deps)).toMatchObject({ status: 'observed', coverage: 'truncated', pages: 3 });
    expect(deps.read).toHaveBeenCalledTimes(3);
  });
  it('retains intake before a provider snapshot fails to persist and retries without duplicate intake', async () => {
    const { deps, ledger } = fixture();
    const persist = deps.persist.getMockImplementation()!;
    deps.persist.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('private error'));
    expect(await runGithubInboxWatch(true, at, deps)).toMatchObject({ status: 'failed', reason: 'watch_cycle_failed' });
    expect(ledger.size).toBe(1);
    expect(await runGithubInboxWatch(true, at, deps)).toMatchObject({ inserted: 1, duplicates: 1 });
  });
});
