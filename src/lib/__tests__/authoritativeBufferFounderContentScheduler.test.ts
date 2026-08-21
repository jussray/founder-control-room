import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FounderContentApprovalRepository } from '../founderContentApprovalStore.js';

const require = createRequire(import.meta.url);
const { canonicalChiefIdentity, hashPublicPayload } = require('../../../tools/founder-content-contracts/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, any>;
  hashPublicPayload: (value: unknown) => string;
};

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  readProviderConfig: vi.fn(),
  readTransportConfig: vi.fn(),
}));

vi.mock('../n8nProviderNeutralFounderContentOrchestrator.js', () => ({
  dispatchProviderNeutralN8nFounderContent: mocks.dispatch,
  readN8nFounderContentProviderConfig: mocks.readProviderConfig,
}));

vi.mock('../n8nFounderContentOrchestrator.js', () => ({
  readN8nFounderContentConfig: mocks.readTransportConfig,
}));

import { dispatchAuthoritativeBufferFounderContentSchedule } from '../authoritativeBufferFounderContentScheduler.js';

const PROPOSAL_HASH = 'a'.repeat(64);
const AUTHORIZATION_HASH = 'c'.repeat(64);
const TEST_PROPOSAL = {
  proposal_hash: PROPOSAL_HASH,
  public_payload: { platform: 'linkedin', draft_text: 'Exact approved copy.' },
};
const PUBLIC_PAYLOAD_HASH = hashPublicPayload(canonicalChiefIdentity(TEST_PROPOSAL).public_payload);
const STORED_APPROVAL = {
  approval_id: 'fca:approval-1',
  proposal_hash: PROPOSAL_HASH,
  public_payload_hash: PUBLIC_PAYLOAD_HASH,
  current_you: {
    authenticated: true,
    source: 'current_authenticated_founder',
    intent_id: 'intent-1',
    intent_version: 3,
    observed_at: '2026-08-20T20:00:00.000Z',
    supersedes_stale_content_intent: true,
  },
};

function repository(result: Awaited<ReturnType<FounderContentApprovalRepository['claim']>>): FounderContentApprovalRepository {
  return {
    issue: vi.fn(async () => true),
    claim: vi.fn(async () => result),
  };
}

function request() {
  return {
    proposal: TEST_PROPOSAL,
    approval_id: 'fca:approval-1',
    confirmation: {
      confirm_schedule: true,
      authorization_hash: AUTHORIZATION_HASH,
      public_payload_hash: PUBLIC_PAYLOAD_HASH,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readTransportConfig.mockReturnValue({
    enabled: true,
    configured: true,
    webhookUrl: 'https://example.invalid/fcr-buffer',
    bearerToken: 'test-token',
  });
  mocks.readProviderConfig.mockReturnValue({ enabledProviders: ['buffer'], invalidProviders: [] });
  mocks.dispatch.mockResolvedValue({
    ok: true,
    code: 'DISPATCHED',
    status: 202,
    request: { orchestrationId: 'buffer-op-1', providerRequest: { provider: 'buffer' } },
    receipt: { provider: 'buffer', state: 'scheduled', published: false },
    reasons: [],
  });
});

describe('authoritative Buffer founder-content scheduler', () => {
  it('preflights Buffer, claims FCR authority, and injects only the stored approval', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });
    const forged = {
      ...request(),
      approval: { approval_id: 'caller-forged', publish_anything: true },
    } as ReturnType<typeof request> & { approval: Record<string, unknown> };

    const result = await dispatchAuthoritativeBufferFounderContentSchedule(forged, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: '2026-08-20T20:10:00.000Z',
      approvalRepository: store,
      env: {},
    });

    expect(result.ok).toBe(true);
    expect(result.transport).toBe('buffer');
    expect(result.published).toBe(false);
    expect(result.approvalConsumed).toBe(true);
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
      consumedBy: 'founder@example.com:buffer-schedule',
    }));
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      proposal: TEST_PROPOSAL,
      approval: STORED_APPROVAL,
      n8n_provider: 'buffer',
    }), expect.objectContaining({ executedBy: 'founder@example.com' }));
    expect(JSON.stringify(mocks.dispatch.mock.calls)).not.toContain('caller-forged');
  });

  it('fails before consuming approval when Buffer is not the sole runtime transport', async () => {
    mocks.readProviderConfig.mockReturnValue({
      enabledProviders: ['buffer', 'x'],
      invalidProviders: [],
    });
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });

    const result = await dispatchAuthoritativeBufferFounderContentSchedule(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      approvalRepository: store,
      env: {},
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('BUFFER_TRANSPORT_NOT_READY');
    expect(result.approvalConsumed).toBe(false);
    expect(result.reasons.join(' ')).toContain('only runtime-enabled');
    expect(store.claim).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('fails before consuming approval when Buffer transport is not configured', async () => {
    mocks.readTransportConfig.mockReturnValue({
      enabled: false,
      configured: false,
      webhookUrl: null,
      bearerToken: null,
    });
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });

    const result = await dispatchAuthoritativeBufferFounderContentSchedule(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      approvalRepository: store,
      env: {},
    });

    expect(result.ok).toBe(false);
    expect(result.approvalConsumed).toBe(false);
    expect(store.claim).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('requires a fresh approval after a post-claim ambiguous provider failure', async () => {
    mocks.dispatch.mockResolvedValue({
      ok: false,
      code: 'UPSTREAM_UNREACHABLE',
      status: 502,
      request: { orchestrationId: 'buffer-op-unknown' },
      receipt: null,
      reasons: ['provider outcome unknown'],
    });
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });

    const result = await dispatchAuthoritativeBufferFounderContentSchedule(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      approvalRepository: store,
      env: {},
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UPSTREAM_UNREACHABLE');
    expect(result.approvalConsumed).toBe(true);
    expect(result.freshApprovalRequiredForRetry).toBe(true);
    expect(result.reasons.join(' ')).toContain('do not blindly retry');
  });

  it('rejects scheduling without exact founder confirmation before authority storage is touched', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });

    const result = await dispatchAuthoritativeBufferFounderContentSchedule({
      ...request(),
      confirmation: { ...request().confirmation, confirm_schedule: false },
    }, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      approvalRepository: store,
      env: {},
    });

    expect(result.ok).toBe(false);
    expect(store.claim).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
