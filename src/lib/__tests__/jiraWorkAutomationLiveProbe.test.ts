import { describe, expect, it, vi } from 'vitest';
import {
  runJiraWorkAutomationLiveProbe,
  validateJiraWorkAutomationLiveProbeOptions,
} from '../jiraWorkAutomationLiveProbe.js';
import type { JiraWorkAutomationInput } from '../jiraWorkAutomation.js';

const SHA = 'a'.repeat(40);
const ISSUE_KEY = 'TC-4';
const RECEIPT = `fcr-jira-receipt-v1:${'b'.repeat(64)}`;

function observation(overrides: Partial<JiraWorkAutomationInput> = {}): JiraWorkAutomationInput {
  return {
    event: 'transitioned',
    projectKey: 'TC',
    issueKey: ISSUE_KEY,
    fromStatus: 'To Do',
    toStatus: 'In Progress',
    assigneeAccountId: null,
    updatedAt: '2026-09-07T05:10:00.000Z',
    observedAt: '2026-09-07T05:10:00.000Z',
    ...overrides,
  };
}

function options(extra: Record<string, unknown> = {}) {
  return {
    expectedHeadSha: SHA,
    probeIssueKey: ISSUE_KEY,
    ingressUrl: 'https://api.foundercontrolroom.org/ingest/jira-work-automation',
    ingressToken: 'jira-ingress-token-32-bytes-minimum-value',
    approvalReference: 'TC-4 controlled provider proof',
    observation: observation(),
    ...extra,
  };
}

describe('Jira work automation live probe', () => {
  it('accepts only the secret-pinned unassigned In Progress probe issue', () => {
    expect(validateJiraWorkAutomationLiveProbeOptions(options())).toEqual([]);

    expect(validateJiraWorkAutomationLiveProbeOptions(options({
      observation: observation({ issueKey: 'TC-5' }),
    }))).toContain('observation issueKey must equal the secret-pinned probe issue key');

    expect(validateJiraWorkAutomationLiveProbeOptions(options({
      observation: observation({ assigneeAccountId: 'someone' }),
    }))).toContain('live probe requires the probe issue to be unassigned before dispatch');
  });

  it('rejects non-HTTPS or broadened ingress URLs', () => {
    expect(validateJiraWorkAutomationLiveProbeOptions(options({
      ingressUrl: 'http://api.foundercontrolroom.org/ingest/jira-work-automation',
    }))).toContain('probe ingress URL must use HTTPS');

    expect(validateJiraWorkAutomationLiveProbeOptions(options({
      ingressUrl: 'https://api.foundercontrolroom.org/ingest/jira-work-automation?issue=TC-5',
    }))).toContain('probe ingress URL must target exactly /ingest/jira-work-automation');
  });

  it('returns dispatch proof only when provider receipt and exact runtime SHA agree', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer jira-ingress-token-32-bytes-minimum-value',
        'Content-Type': 'application/json',
        'X-FCR-Jira-Live-Probe': 'v1',
      });
      expect(JSON.parse(String(init?.body)).issueKey).toBe(ISSUE_KEY);

      return new Response(JSON.stringify({
        ok: true,
        code: 'DISPATCHED',
        receiptId: RECEIPT,
        runtimeHeadSha: SHA,
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const receipt = await runJiraWorkAutomationLiveProbe({
      ...options(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(receipt).toMatchObject({
      verifiedDispatch: true,
      endToEndComplete: false,
      independentJiraReadbackRequired: true,
      expectedHeadSha: SHA,
      runtimeHeadSha: SHA,
      issueKey: ISSUE_KEY,
      receiptId: RECEIPT,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the live runtime is not the exact requested main SHA', async () => {
    await expect(runJiraWorkAutomationLiveProbe({
      ...options(),
      fetchImpl: (async () => new Response(JSON.stringify({
        ok: true,
        code: 'DISPATCHED',
        receiptId: RECEIPT,
        runtimeHeadSha: 'c'.repeat(40),
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    })).rejects.toThrow('JIRA_WORK_AUTOMATION_LIVE_PROBE_RUNTIME_MISMATCH');
  });

  it('fails closed on missing canonical receipt or provider rejection', async () => {
    await expect(runJiraWorkAutomationLiveProbe({
      ...options(),
      fetchImpl: (async () => new Response(JSON.stringify({
        ok: true,
        code: 'DISPATCHED',
        receiptId: 'wrong',
        runtimeHeadSha: SHA,
      }), { status: 202, headers: { 'Content-Type': 'application/json' } })) as typeof fetch,
    })).rejects.toThrow('JIRA_WORK_AUTOMATION_LIVE_PROBE_RECEIPT_MISMATCH');

    await expect(runJiraWorkAutomationLiveProbe({
      ...options(),
      fetchImpl: (async () => new Response(JSON.stringify({
        ok: false,
        code: 'AUTOMATION_DISABLED',
        receiptId: null,
      }), { status: 409, headers: { 'Content-Type': 'application/json' } })) as typeof fetch,
    })).rejects.toThrow('JIRA_WORK_AUTOMATION_LIVE_PROBE_PROVIDER_REJECTED');
  });
});
