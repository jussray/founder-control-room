import { describe, expect, it, vi } from 'vitest';
import {
  buildJiraWorkAutomationPlan,
  dispatchJiraWorkAutomation,
  expectedJiraWorkAutomationReceiptId,
  readJiraWorkAutomationConfig,
  validateJiraWorkAutomationInput,
  type JiraWorkAutomationInput,
} from '../jiraWorkAutomation.js';

const SHA = 'a'.repeat(40);

function enabledEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    N8N_JIRA_AUTOMATION_ENABLED: 'true',
    N8N_JIRA_AUTOMATION_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr-jira',
    N8N_JIRA_AUTOMATION_BEARER_TOKEN: 'bridge-secret',
    JIRA_AUTOMATION_OWNER_ACCOUNT_ID: 'jira-account-sekretbip',
    JIRA_AUTOMATION_STALE_AFTER_HOURS: '72',
    GIT_SHA: SHA,
    ...extra,
  };
}

function input(overrides: Partial<JiraWorkAutomationInput> = {}): JiraWorkAutomationInput {
  return {
    event: 'transitioned',
    projectKey: 'FCR',
    issueKey: 'FCR-123',
    fromStatus: 'To Do',
    toStatus: 'In Progress',
    assigneeAccountId: null,
    updatedAt: '2026-08-29T04:00:00.000Z',
    observedAt: '2026-08-29T04:00:00.000Z',
    ...overrides,
  };
}

describe('Jira work automation contract', () => {
  it('is disabled and unconfigured by default', () => {
    expect(readJiraWorkAutomationConfig({})).toEqual({
      enabled: false,
      configured: false,
      webhookUrl: null,
      bearerToken: null,
      ownerAccountId: null,
      ownerLabel: 'sekretbip',
      staleAfterHours: null,
      staleGuardConfigured: false,
      runtimeHeadSha: null,
    });
  });

  it('requires an exact runtime head and exact Jira account mapping before dispatch can be configured', () => {
    expect(readJiraWorkAutomationConfig(enabledEnv({ GIT_SHA: '' })).configured).toBe(false);
    expect(readJiraWorkAutomationConfig(enabledEnv({ JIRA_AUTOMATION_OWNER_ACCOUNT_ID: '' })).configured).toBe(false);
    expect(readJiraWorkAutomationConfig(enabledEnv()).configured).toBe(true);
  });

  it('builds the In Progress ownership gate without broader Jira authority', () => {
    const plan = buildJiraWorkAutomationPlan(input(), readJiraWorkAutomationConfig(enabledEnv()));

    expect(plan.actions).toEqual([{
      type: 'assign-owner',
      ownerLabel: 'sekretbip',
      ownerAccountId: 'jira-account-sekretbip',
    }]);
    expect(plan.authority).toEqual({
      assignIssue: true,
      commentIssue: false,
      transitionIssue: false,
      closeIssue: false,
      deleteIssue: false,
      mutateProjectSettings: false,
    });
    expect(plan.runtimeHeadSha).toBe(SHA);
    expect(plan.idempotencyKey).toMatch(/^fcr-jira-v1:[0-9a-f]{64}$/);
  });

  it('does not steal an already assigned In Progress item', () => {
    const plan = buildJiraWorkAutomationPlan(
      input({ assigneeAccountId: 'another-jira-account' }),
      readJiraWorkAutomationConfig(enabledEnv()),
    );
    expect(plan.actions).toEqual([]);
    expect(plan.authority.assignIssue).toBe(false);
  });

  it('adds a stale-work comment on the scheduled scan after the configured threshold', () => {
    const plan = buildJiraWorkAutomationPlan(
      input({
        event: 'scheduled-scan',
        assigneeAccountId: 'jira-account-sekretbip',
        updatedAt: '2026-08-25T04:00:00.000Z',
        observedAt: '2026-08-29T04:00:00.000Z',
      }),
      readJiraWorkAutomationConfig(enabledEnv()),
    );

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({ type: 'comment-stale', staleAfterHours: 72 });
    expect(plan.authority.commentIssue).toBe(true);
    expect(plan.authority.transitionIssue).toBe(false);
    expect(plan.authority.closeIssue).toBe(false);
  });

  it('self-heals missing ownership during a scheduled stale scan without gaining transition authority', () => {
    const plan = buildJiraWorkAutomationPlan(
      input({
        event: 'scheduled-scan',
        assigneeAccountId: null,
        updatedAt: '2026-08-25T04:00:00.000Z',
        observedAt: '2026-08-29T04:00:00.000Z',
      }),
      readJiraWorkAutomationConfig(enabledEnv()),
    );

    expect(plan.actions.map((action) => action.type)).toEqual(['assign-owner', 'comment-stale']);
    expect(plan.authority).toMatchObject({
      assignIssue: true,
      commentIssue: true,
      transitionIssue: false,
      closeIssue: false,
      deleteIssue: false,
    });
  });

  it('keeps a fresh scheduled item as a no-op', () => {
    const plan = buildJiraWorkAutomationPlan(
      input({
        event: 'scheduled-scan',
        assigneeAccountId: 'jira-account-sekretbip',
        updatedAt: '2026-08-28T12:00:00.000Z',
        observedAt: '2026-08-29T04:00:00.000Z',
      }),
      readJiraWorkAutomationConfig(enabledEnv()),
    );
    expect(plan.actions).toEqual([]);
  });

  it('fails closed on cross-project issue identity and future-dated update state', () => {
    expect(validateJiraWorkAutomationInput(input({ issueKey: 'OPS-123' })))
      .toContain('issueKey must belong to projectKey');
    expect(validateJiraWorkAutomationInput(input({
      updatedAt: '2026-08-30T04:00:00.000Z',
      observedAt: '2026-08-29T04:00:00.000Z',
    }))).toContain('updatedAt cannot be later than observedAt');
  });

  it('does not call n8n while Jira automation is disabled', async () => {
    const fetchImpl = vi.fn();
    const result = await dispatchJiraWorkAutomation(input(), {
      env: enabledEnv({ N8N_JIRA_AUTOMATION_ENABLED: 'false' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: false,
      code: 'AUTOMATION_DISABLED',
      status: 409,
      receiptId: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts dispatch only when n8n returns the exact plan-bound receipt', async () => {
    const env = enabledEnv();
    const plan = buildJiraWorkAutomationPlan(input(), readJiraWorkAutomationConfig(env));
    const expectedReceiptId = expectedJiraWorkAutomationReceiptId(plan);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.contract).toBe('founder-control-room/jira-work-automation@v1');
      expect(body.runtimeHeadSha).toBe(SHA);
      expect(body.authority.transitionIssue).toBe(false);
      expect(body.authority.closeIssue).toBe(false);
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer bridge-secret',
        'Idempotency-Key': body.idempotencyKey,
        'X-FCR-Jira-Automation-Contract': 'v1',
      });
      return new Response(JSON.stringify({ receiptId: expectedReceiptId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await dispatchJiraWorkAutomation(input(), {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      receiptId: expectedReceiptId,
    });
  });

  it('rejects a provider acknowledgement that is not bound to the exact plan', async () => {
    const result = await dispatchJiraWorkAutomation(input(), {
      env: enabledEnv(),
      fetchImpl: (async () => new Response(JSON.stringify({ receiptId: 'wrong' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    });

    expect(result).toEqual({
      ok: false,
      code: 'PROVIDER_REJECTED',
      status: 502,
      receiptId: null,
    });
  });
});
