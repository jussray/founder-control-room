import { describe, expect, it, vi } from 'vitest';
import {
  runJiraWorkAutomationLiveProbe,
  validateJiraWorkAutomationLiveProbeOptions,
} from '../jiraWorkAutomationLiveProbe.js';
import type { JiraWorkAutomationInput } from '../jiraWorkAutomation.js';

const SHA = 'a'.repeat(40);
const ISSUE_KEY = 'TC-4';
const RECEIPT = `fcr-jira-receipt-v1:${'b'.repeat(64)}`;
const INGRESS_URL = 'https://api.foundercontrolroom.org/ingest/jira-work-automation';
const VERSION_URL = 'https://api.foundercontrolroom.org/version';

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
    ingressUrl: INGRESS_URL,
    ingressToken: 'jira-ingress-token-32-bytes-minimum-value',
    approvalReference: 'TC-4 controlled provider proof',
    observation: observation(),
    ...extra,
  };
}

function versionResponse(sha = SHA, service = 'founder-control-room') {
  return new Response(JSON.stringify({ service, gitSha: sha }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dispatchResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    ok: true,
    code: 'DISPATCHED',
    receiptId: RECEIPT,
    runtimeHeadSha: SHA,
    ...overrides,
  }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
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

  it('preflights exact runtime identity before dispatch and returns dispatch proof', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === VERSION_URL) {
        expect(init?.method).toBe('GET');
        return versionResponse();
      }

      expect(String(url)).toBe(INGRESS_URL);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer jira-ingress-token-32-bytes-minimum-value',
        'Content-Type': 'application/json',
        'X-FCR-Jira-Live-Probe': 'v1',
      });
      expect(JSON.parse(String(init?.body)).issueKey).toBe(ISSUE_KEY);
      return dispatchResponse();
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
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(VERSION_URL);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe(INGRESS_URL);
  });

  it('blocks the mutation when the pre-dispatch runtime is not the exact requested main SHA', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => versionResponse('c'.repeat(40)));

    await expect(runJiraWorkAutomationLiveProbe({
      ...options(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('JIRA_WORK_AUTOMATION_LIVE_PROBE_RUNTIME_MISMATCH');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(VERSION_URL);
  });

  it('fails closed when the runtime changes after dispatch', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === VERSION_URL) return versionResponse();
      return dispatchResponse({ runtimeHeadSha: 'c'.repeat(40) });
    });

    await expect(runJiraWorkAutomationLiveProbe({
      ...options(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('JIRA_WORK_AUTOMATION_LIVE_PROBE_RUNTIME_MISMATCH');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails closed on missing canonical receipt or provider rejection', async () => {
    const missingReceiptFetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === VERSION_URL) return versionResponse();
      return dispatchResponse({ receiptId: 'wrong' });
    });

    await expect(runJiraWorkAutomationLiveProbe({
      ...options(),
      fetchImpl: missingReceiptFetch as unknown as typeof fetch,
    })).rejects.toThrow('JIRA_WORK_AUTOMATION_LIVE_PROBE_RECEIPT_MISMATCH');

    const providerRejectFetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === VERSION_URL) return versionResponse();
      return new Response(JSON.stringify({
        ok: false,
        code: 'AUTOMATION_DISABLED',
        receiptId: null,
      }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    });

    await expect(runJiraWorkAutomationLiveProbe({
      ...options(),
      fetchImpl: providerRejectFetch as unknown as typeof fetch,
    })).rejects.toThrow('JIRA_WORK_AUTOMATION_LIVE_PROBE_PROVIDER_REJECTED');
  });
});
