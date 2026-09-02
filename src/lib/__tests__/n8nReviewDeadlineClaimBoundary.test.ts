import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readCurrent: vi.fn(),
  claim: vi.fn(),
  prepare: vi.fn(),
  abort: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock('../founderContentApprovalStore.js', () => ({
  readCurrentFounderContentApproval: mocks.readCurrent,
  claimFounderContentApproval: mocks.claim,
}));

vi.mock('../n8nProviderNeutralFounderContentPreparation.js', () => ({
  prepareProviderNeutralN8nFounderContent: mocks.prepare,
}));

vi.mock('../n8nProviderNeutralFounderContentOrchestrator.js', () => ({
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES: { buffer: {} },
  readN8nFounderContentProviderConfig: () => ({
    enabledProviders: ['buffer'],
    invalidProviders: [],
  }),
  resolveN8nFounderContentProvider: () => 'buffer',
}));

vi.mock('../n8nFounderContentOrchestrator.js', () => ({
  readN8nFounderContentConfig: () => ({
    enabled: true,
    configured: true,
    webhookUrl: 'https://n8n.example/webhook/founder-content',
    bearerToken: 'server-only-test-token',
  }),
}));

import { dispatchAuthoritativeN8nFounderContent } from '../n8nFounderContentAuthorityAdapter.js';

const NOW = '2026-08-18T01:30:00.000Z';
const CLAIM_NOW = '2026-08-18T01:45:00.000Z';
const ORIGINAL_REVIEW_DEADLINE = '2026-08-18T01:40:00.000Z';
const DEFERRED_SCHEDULE = '2026-08-18T01:50:00.000Z';
const APPROVAL_EXPIRES_AT = '2026-08-18T02:10:00.000Z';

const preparedRequest = {
  providerRequest: {
    scheduleAt: DEFERRED_SCHEDULE,
    reviewDeadline: ORIGINAL_REVIEW_DEADLINE,
    reviewWindowMinutes: 20,
  },
};

function request() {
  return {
    proposal: {
      public_payload: { platform: 'linkedin' },
    },
    approval_id: 'fca:review-window-test',
    n8n_provider: 'buffer',
    confirmation: {
      confirm_publication: true,
      authorization_hash: 'a'.repeat(64),
      public_payload_hash: 'b'.repeat(64),
    },
  };
}

describe('authoritative n8n review deadline claim boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preparedRequest.providerRequest.reviewDeadline = ORIGINAL_REVIEW_DEADLINE;
    mocks.abort.mockResolvedValue(true);
    mocks.dispatch.mockResolvedValue({
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      request: preparedRequest,
      receipt: null,
      reasons: [],
    });
    mocks.readCurrent.mockResolvedValue({
      ok: true,
      approval: {
        approval_id: 'fca:review-window-test',
        expires_at: APPROVAL_EXPIRES_AT,
      },
      approvalId: 'fca:review-window-test',
      authorizationHash: 'a'.repeat(64),
      publicPayloadHash: 'b'.repeat(64),
    });
    mocks.claim.mockResolvedValue({
      ok: true,
      approval: {
        approval_id: 'fca:review-window-test',
        expires_at: APPROVAL_EXPIRES_AT,
      },
      approvalId: 'fca:review-window-test',
      authorizationHash: 'a'.repeat(64),
      publicPayloadHash: 'b'.repeat(64),
    });
    mocks.prepare.mockResolvedValue({
      prepared: true,
      request: preparedRequest,
      executionId: '22222222-2222-4222-8222-222222222222',
      abort: mocks.abort,
      dispatch: mocks.dispatch,
    });
  });

  it('moves a stale cadence review deadline to the deferred schedule and still reaches n8n', async () => {
    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: NOW,
      claimNow: CLAIM_NOW,
      env: {},
    });

    expect(result.ok).toBe(true);
    expect(preparedRequest.providerRequest.reviewDeadline).toBe(DEFERRED_SCHEDULE);
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });

  it('rejects a review deadline that extends beyond the provider schedule before claim or n8n dispatch', async () => {
    preparedRequest.providerRequest.reviewDeadline = '2026-08-18T01:55:00.000Z';

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: NOW,
      claimNow: CLAIM_NOW,
      env: {},
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_AUTHORIZATION');
    expect(result.reasons.join(' ')).toContain('review deadline must match the provider schedule after cadence');
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.abort).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
