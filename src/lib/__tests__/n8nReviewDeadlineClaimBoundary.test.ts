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
const REVIEW_DEADLINE = '2026-08-18T01:40:00.000Z';
const DEFERRED_SCHEDULE = '2026-08-18T01:50:00.000Z';
const APPROVAL_EXPIRES_AT = '2026-08-18T02:10:00.000Z';

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
    mocks.abort.mockResolvedValue(true);
    mocks.dispatch.mockResolvedValue({
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      request: null,
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
    mocks.prepare.mockResolvedValue({
      prepared: true,
      request: {
        providerRequest: {
          scheduleAt: DEFERRED_SCHEDULE,
          reviewDeadline: REVIEW_DEADLINE,
        },
      },
      executionId: '22222222-2222-4222-8222-222222222222',
      abort: mocks.abort,
      dispatch: mocks.dispatch,
    });
  });

  it('rejects an expired review window before consuming approval or dispatching the deferred provider request', async () => {
    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: NOW,
      claimNow: CLAIM_NOW,
      env: {},
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_AUTHORIZATION');
    expect(result.reasons.join(' ')).toContain('review window expired before the final approval claim');
    expect(result.reasons.join(' ')).toContain('did not consume the one-shot approval');
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.abort).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
