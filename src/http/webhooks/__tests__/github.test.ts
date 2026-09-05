import { createHmac } from 'crypto';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPersistProviderEvent,
  mockEnqueueReconcile,
  mockStoreBuildEvent,
  mockFrom,
  mockSelect,
  mockEq,
  mockFilter,
  mockLimit,
  mockMaybeSingle,
} = vi.hoisted(() => ({
  mockPersistProviderEvent: vi.fn(),
  mockEnqueueReconcile: vi.fn(),
  mockStoreBuildEvent: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockFilter: vi.fn(),
  mockLimit: vi.fn(),
  mockMaybeSingle: vi.fn(),
}));

vi.mock('../../../events/inbox.js', () => ({
  persistProviderEvent: mockPersistProviderEvent,
}));

vi.mock('../../../events/outbox.js', () => ({
  enqueueReconcile: mockEnqueueReconcile,
}));

vi.mock('../../../services/buildEventStore.js', () => ({
  storeBuildEvent: mockStoreBuildEvent,
}));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

import { handleGitHubWebhook } from '../github.js';

const ORIGINAL_SECRET = process.env['GITHUB_WEBHOOK_SECRET'];

function makeResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

function signedRequest(payload: unknown, eventType = 'pull_request') {
  const body = Buffer.from(JSON.stringify(payload));
  const secret = process.env['GITHUB_WEBHOOK_SECRET']!;
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  return {
    body,
    headers: {
      'x-hub-signature-256': signature,
      'x-github-event': eventType,
      'x-github-delivery': 'delivery-123',
    },
  } as unknown as Request;
}

beforeEach(() => {
  process.env['GITHUB_WEBHOOK_SECRET'] = 'test-webhook-secret';

  const chain = {
    select: mockSelect,
    eq: mockEq,
    filter: mockFilter,
    limit: mockLimit,
    maybeSingle: mockMaybeSingle,
  };

  mockFrom.mockReturnValue(chain);
  mockSelect.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockFilter.mockReturnValue(chain);
  mockLimit.mockReturnValue(chain);
  mockMaybeSingle.mockResolvedValue({
    data: { project_id: 'project-123' },
    error: null,
  });
  mockPersistProviderEvent.mockResolvedValue({
    id: 'event-123',
    isDuplicate: false,
  });
  mockStoreBuildEvent.mockResolvedValue('stored');
  mockEnqueueReconcile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_SECRET === undefined) delete process.env['GITHUB_WEBHOOK_SECRET'];
  else process.env['GITHUB_WEBHOOK_SECRET'] = ORIGINAL_SECRET;
});

describe('GitHub webhook ingestion', () => {
  it('verifies raw bytes, parses JSON, resolves the live connection schema, and enqueues work', async () => {
    const payload = {
      repository: { full_name: 'jussray/Sekret-Bip' },
      pull_request: { number: 480 },
    };
    const req = signedRequest(payload);
    const res = makeResponse();

    await handleGitHubWebhook(req, res as unknown as Response);

    expect(mockFrom).toHaveBeenCalledWith('project_connections');
    expect(mockEq).toHaveBeenNthCalledWith(1, 'connection_type', 'git');
    expect(mockEq).toHaveBeenNthCalledWith(2, 'status', 'active');
    expect(mockFilter).toHaveBeenCalledWith(
      'config->>repository',
      'eq',
      'jussray/Sekret-Bip',
    );

    expect(mockPersistProviderEvent).toHaveBeenCalledWith({
      provider: 'github',
      projectId: 'project-123',
      providerEventId: 'delivery-123',
      eventType: 'pull_request',
      resourceType: 'pull_request',
      resourceId: '480',
      payload: {
        repository: { full_name: 'jussray/Sekret-Bip' },
        pull_request: { number: 480, head: undefined, base: undefined, user: undefined },
      },
    });
    expect(mockEnqueueReconcile).toHaveBeenCalledWith(
      {
        projectId: 'project-123',
        controller: 'ChangeProposalController',
        resourceId: '480',
        reason: 'provider_event',
        sourceEventId: 'event-123',
      },
      { availableAt: expect.any(String) },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      accepted: true,
      eventId: 'event-123',
      controllers: ['ChangeProposalController'],
      enqueueFailures: [],
      buildMemory: 'not-projectable',
    });
  });

  it('binds a merged pull-request webhook to landed source truth and ledger reconciliation', async () => {
    const reviewedHeadSha = 'a'.repeat(40);
    const mergeCommitSha = 'c'.repeat(40);
    const payload = {
      repository: { full_name: 'jussray/founder-control-room' },
      action: 'closed',
      pull_request: {
        number: 482,
        title: 'Land portfolio merge truth',
        state: 'closed',
        merged: true,
        merge_commit_sha: mergeCommitSha,
        html_url: 'https://github.com/jussray/founder-control-room/pull/482',
        updated_at: '2026-09-04T16:30:00Z',
        head: { sha: reviewedHeadSha, ref: 'fix/portfolio-merge-truth' },
        base: { ref: 'main' },
        user: { login: 'jussray' },
      },
    };
    const req = signedRequest(payload);
    const res = makeResponse();

    await handleGitHubWebhook(req, res as unknown as Response);

    expect(mockPersistProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'github',
      projectId: 'project-123',
      providerEventId: 'delivery-123',
      eventType: 'pull_request',
      resourceType: 'pull_request',
      resourceId: '482',
      payload: expect.objectContaining({
        repository: { full_name: 'jussray/founder-control-room' },
        pull_request: expect.objectContaining({
          number: 482,
          merged: true,
          merge_commit_sha: mergeCommitSha,
          head: { sha: reviewedHeadSha, ref: 'fix/portfolio-merge-truth' },
          base: { ref: 'main' },
        }),
      }),
    }));
    expect(mockStoreBuildEvent).toHaveBeenCalledWith(
      'project-123',
      expect.objectContaining({
        source: 'github',
        category: 'source',
        truth: 'verified',
        status: 'completed',
        repository: {
          name: 'jussray/founder-control-room',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: mergeCommitSha,
          auditedCommitSha: reviewedHeadSha,
        },
      }),
    );
    expect(mockEnqueueReconcile).toHaveBeenCalledTimes(2);
    expect(mockEnqueueReconcile).toHaveBeenCalledWith(
      {
        projectId: 'project-123',
        controller: 'ChangeProposalController',
        resourceId: '482',
        reason: 'provider_event',
        sourceEventId: 'event-123',
      },
      { availableAt: expect.any(String) },
    );
    expect(mockEnqueueReconcile).toHaveBeenCalledWith(
      {
        projectId: 'project-123',
        controller: 'PortfolioLedgerProjectionController',
        resourceId: mergeCommitSha,
        reason: 'provider_event',
        sourceEventId: 'event-123',
      },
      { availableAt: expect.any(String) },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      accepted: true,
      eventId: 'event-123',
      controllers: ['ChangeProposalController', 'PortfolioLedgerProjectionController'],
      enqueueFailures: [],
      buildMemory: 'stored',
    });
  });

  it('routes a future repository through the explicit all-owned portfolio connection', async () => {
    const directChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const portfolioQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (
        resolve: (value: { data: Array<{ project_id: string; config: unknown }>; error: null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve({
        data: [{
          project_id: 'portfolio-123',
          config: {
            repositoryScope: { mode: 'all_owned', owner: 'jussray' },
          },
        }],
        error: null,
      }).then(resolve, reject),
    };

    mockFrom.mockReset();
    mockFrom
      .mockReturnValueOnce(directChain)
      .mockReturnValueOnce(portfolioQuery);

    const payload = {
      repository: { full_name: 'jussray/brand-new-repo' },
      pull_request: { number: 481 },
    };
    const req = signedRequest(payload);
    const res = makeResponse();

    await handleGitHubWebhook(req, res as unknown as Response);

    expect(mockPersistProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'portfolio-123',
      providerEventId: 'delivery-123',
      eventType: 'pull_request',
      resourceId: '481',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      accepted: true,
      controllers: ['ChangeProposalController'],
    }));
  });

  it('strips fields the controllers never read — sender, organization, installation, review bodies', async () => {
    const payload = {
      repository: { full_name: 'jussray/Sekret-Bip', private: true, owner: { login: 'jussray' } },
      action: 'opened',
      pull_request: {
        number: 480,
        title: 'Add feature',
        state: 'open',
        merged: false,
        merge_commit_sha: null,
        html_url: 'https://github.com/jussray/Sekret-Bip/pull/480',
        updated_at: '2026-07-18T00:00:00Z',
        body: 'This PR contains sensitive internal planning notes.',
        head: { sha: 'a'.repeat(40), ref: 'feature/x', repo: { full_name: 'jussray/Sekret-Bip' } },
        base: { ref: 'main' },
        user: { login: 'jussray', id: 999, avatar_url: 'https://example.com/avatar.png' },
        requested_reviewers: [{ login: 'someone-private' }],
      },
      sender: { login: 'jussray', id: 999 },
      organization: { login: 'jussray-org' },
      installation: { id: 12345 },
    };
    const req = signedRequest(payload);
    const res = makeResponse();

    await handleGitHubWebhook(req, res as unknown as Response);

    const storedPayload = mockPersistProviderEvent.mock.calls[0][0].payload;
    expect(storedPayload).toEqual({
      repository: { full_name: 'jussray/Sekret-Bip' },
      action: 'opened',
      pull_request: {
        number: 480,
        title: 'Add feature',
        state: 'open',
        merged: false,
        merge_commit_sha: null,
        html_url: 'https://github.com/jussray/Sekret-Bip/pull/480',
        updated_at: '2026-07-18T00:00:00Z',
        head: { sha: 'a'.repeat(40), ref: 'feature/x' },
        base: { ref: 'main' },
        user: { login: 'jussray' },
      },
    });
    expect(storedPayload.sender).toBeUndefined();
    expect(storedPayload.organization).toBeUndefined();
    expect(storedPayload.installation).toBeUndefined();
    expect(storedPayload.pull_request.body).toBeUndefined();
    expect(storedPayload.pull_request.user.avatar_url).toBeUndefined();
    expect(storedPayload.pull_request.requested_reviewers).toBeUndefined();
    expect(mockStoreBuildEvent).toHaveBeenCalledWith(
      'project-123',
      expect.objectContaining({
        source: 'github',
        category: 'source',
        truth: 'verified',
        repository: expect.objectContaining({
          name: 'jussray/Sekret-Bip',
          branch: 'feature/x',
          commitSha: 'a'.repeat(40),
        }),
      }),
    );
  });

  it('retries build-memory projection on a duplicate provider delivery without re-enqueueing work', async () => {
    mockPersistProviderEvent.mockResolvedValue({
      id: 'event-123',
      isDuplicate: true,
    });
    mockStoreBuildEvent.mockResolvedValue('duplicate');

    const payload = {
      repository: { full_name: 'jussray/founder-control-room' },
      ref: 'refs/heads/main',
      after: 'b'.repeat(40),
      compare: `https://github.com/jussray/founder-control-room/compare/${'a'.repeat(40)}...${'b'.repeat(40)}`,
    };
    const req = signedRequest(payload, 'push');
    const res = makeResponse();

    await handleGitHubWebhook(req, res as unknown as Response);

    expect(mockStoreBuildEvent).toHaveBeenCalledTimes(1);
    expect(mockEnqueueReconcile).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      accepted: true,
      duplicate: true,
      buildMemory: 'duplicate',
    });
  });

  it('rejects invalid JSON only after the raw-body signature passes', async () => {
    const body = Buffer.from('{not-json');
    const signature = `sha256=${createHmac('sha256', process.env['GITHUB_WEBHOOK_SECRET']!)
      .update(body)
      .digest('hex')}`;
    const req = {
      body,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'push',
        'x-github-delivery': 'delivery-456',
      },
    } as unknown as Request;
    const res = makeResponse();

    await handleGitHubWebhook(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid JSON payload' });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockPersistProviderEvent).not.toHaveBeenCalled();
    expect(mockStoreBuildEvent).not.toHaveBeenCalled();
    expect(mockEnqueueReconcile).not.toHaveBeenCalled();
  });
});
