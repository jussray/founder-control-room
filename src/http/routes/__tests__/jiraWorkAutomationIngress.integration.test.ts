import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../server.js';
import { expectedJiraWorkAutomationReceiptId, type JiraWorkAutomationPlan } from '../../../lib/jiraWorkAutomation.js';

const NOW = Date.parse('2026-08-30T05:10:00.000Z');
const SECRET = 'jira-ingress-secret-32-bytes-minimum-value';
const SHA = 'a'.repeat(40);
const ENV_KEYS = [
  'FCR_JIRA_AUTOMATION_INGRESS_SECRET',
  'N8N_JIRA_AUTOMATION_ENABLED',
  'N8N_JIRA_AUTOMATION_WEBHOOK_URL',
  'N8N_JIRA_AUTOMATION_BEARER_TOKEN',
  'JIRA_AUTOMATION_OWNER_ACCOUNT_ID',
  'JIRA_AUTOMATION_STALE_AFTER_HOURS',
  'GIT_SHA',
] as const;

function observation(overrides: Record<string, unknown> = {}) {
  return {
    event: 'transitioned',
    projectKey: 'FCR',
    issueKey: 'FCR-123',
    fromStatus: 'To Do',
    toStatus: 'In Progress',
    assigneeAccountId: null,
    updatedAt: '2026-08-30T05:09:45.000Z',
    observedAt: '2026-08-30T05:10:00.000Z',
    ...overrides,
  };
}

function signature(rawBody: string, timestamp = String(NOW)): string {
  return createHmac('sha256', SECRET)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(rawBody, 'utf8')
    .digest('hex');
}

function signedPost(rawBody: string, timestamp = String(NOW)) {
  return request(createServer())
    .post('/ingest/jira-work-automation')
    .set('Content-Type', 'application/json')
    .set('x-fcr-jira-timestamp', timestamp)
    .set('x-fcr-jira-signature', signature(rawBody, timestamp))
    .send(rawBody);
}

describe('Jira work automation signed ingress', () => {
  beforeEach(() => {
    process.env.FCR_JIRA_AUTOMATION_INGRESS_SECRET = SECRET;
    process.env.N8N_JIRA_AUTOMATION_ENABLED = 'true';
    process.env.N8N_JIRA_AUTOMATION_WEBHOOK_URL = 'https://n8n.example.com/webhook/fcr-jira';
    process.env.N8N_JIRA_AUTOMATION_BEARER_TOKEN = 'provider-bridge-secret';
    process.env.JIRA_AUTOMATION_OWNER_ACCOUNT_ID = 'jira-account-sekretbip';
    process.env.JIRA_AUTOMATION_STALE_AFTER_HOURS = '72';
    process.env.GIT_SHA = SHA;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reaches the real bounded dispatcher from a correctly signed service request', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const plan = JSON.parse(String(init?.body)) as JiraWorkAutomationPlan;
      expect(plan.contract).toBe('founder-control-room/jira-work-automation@v1');
      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0]?.type).toBe('assign-owner');
      expect(plan.authority.transitionIssue).toBe(false);
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer provider-bridge-secret',
        'Idempotency-Key': plan.idempotencyKey,
        'X-FCR-Jira-Automation-Contract': 'v1',
      });

      return new Response(JSON.stringify({
        receiptId: expectedJiraWorkAutomationReceiptId(plan),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const rawBody = JSON.stringify(observation());
    const response = await signedPost(rawBody);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      ok: true,
      code: 'DISPATCHED',
    });
    expect(response.body.receiptId).toMatch(/^fcr-jira-receipt-v1:[0-9a-f]{64}$/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid transport signature before any provider call', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const rawBody = JSON.stringify(observation());

    const response = await request(createServer())
      .post('/ingest/jira-work-automation')
      .set('Content-Type', 'application/json')
      .set('x-fcr-jira-timestamp', String(NOW))
      .set('x-fcr-jira-signature', '0'.repeat(64))
      .send(rawBody);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a replayed transport timestamp outside the five-minute window', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const staleTimestamp = String(NOW - (6 * 60 * 1000));
    const rawBody = JSON.stringify(observation());

    const response = await signedPost(rawBody, staleTimestamp);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('binds observedAt to the signed transport so future observation time cannot manufacture stale eligibility', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const rawBody = JSON.stringify(observation({
      observedAt: new Date(NOW + 31_000).toISOString(),
    }));

    const response = await signedPost(rawBody);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_JIRA_AUTOMATION_OBSERVATION');
    expect(response.body.reasons).toContain('observedAt cannot materially postdate the signed transport');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied action or authority fields instead of accepting a prebuilt plan', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const rawBody = JSON.stringify({
      ...observation(),
      actions: [{ type: 'comment-stale' }],
      authority: { transitionIssue: true },
    });

    const response = await signedPost(rawBody);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_JIRA_AUTOMATION_OBSERVATION');
    expect(response.body.reasons.join(' ')).toContain('unexpected fields are forbidden');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('remains fail-closed when the FCR Jira bridge is disabled', async () => {
    process.env.N8N_JIRA_AUTOMATION_ENABLED = 'false';
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const rawBody = JSON.stringify(observation());

    const response = await signedPost(rawBody);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      ok: false,
      code: 'AUTOMATION_DISABLED',
      receiptId: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
