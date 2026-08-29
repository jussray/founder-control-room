import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import type { FounderContentApprovalRepository } from '../founderContentApprovalStore.js';
import type { N8nFounderContentDispatchResult } from '../n8nFounderContentOrchestrator.js';
import { dispatchAuthoritativeN8nFounderContent } from '../authoritativeN8nFounderContentPublisher.js';

const require = createRequire(import.meta.url);
const { canonicalChiefIdentity, hashPublicPayload } = require('../../../tools/zapier/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, any>;
  hashPublicPayload: (value: unknown) => string;
};

const PROPOSAL_HASH = 'a'.repeat(64);
const AUTHORIZATION_HASH = 'c'.repeat(64);
const TEST_PROPOSAL = {
  proposal_hash: PROPOSAL_HASH,
  public_payload: { platform: 'linkedin', draft_text: 'Exact approved Buffer test copy.' },
};
const PUBLIC_PAYLOAD_HASH = hashPublicPayload(canonicalChiefIdentity(TEST_PROPOSAL).public_payload);
const STORED_APPROVAL = {
  approval_id: 'fca:buffer-test-1',
  proposal_hash: PROPOSAL_HASH,
  public_payload_hash: PUBLIC_PAYLOAD_HASH,
  current_you: {
    authenticated: true,
    source: 'current_authenticated_founder',
    intent_id: 'intent-buffer-test',
    intent_version: 4,
    observed_at: '2026-08-28T23:50:00.000Z',
    supersedes_stale_content_intent: true,
  },
};

const READY_ENV = {
  N8N_FOUNDER_CONTENT_ENABLED: 'true',
  N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
  N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'server-only-test-token',
  N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
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
    approval_id: 'fca:buffer-test-1',
    n8n_provider: 'buffer',
    confirmation: {
      confirm_publication: true,
      authorization_hash: AUTHORIZATION_HASH,
      public_payload_hash: PUBLIC_PAYLOAD_HASH,
    },
  };
}

function dispatched(): N8nFounderContentDispatchResult {
  return {
    ok: true,
    code: 'DISPATCHED',
    status: 202,
    request: null,
    receipt: null,
    reasons: [],
  };
}

describe('authoritative n8n founder-content publisher', () => {
  it('injects only the one-shot approval claimed from FCR storage before provider dispatch', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:buffer-test-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });
    const dispatch = vi.fn(async () => dispatched());

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: '2026-08-28T23:55:00.000Z',
      env: READY_ENV,
      approvalRepository: store,
      dispatch,
    });

    expect(result.ok).toBe(true);
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      approvalId: 'fca:buffer-test-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
      consumedBy: 'founder@example.com',
    }));
    expect(dispatch).toHaveBeenCalledWith({
      n8n_provider: 'buffer',
      proposal: TEST_PROPOSAL,
      approval: STORED_APPROVAL,
      now: '2026-08-28T23:55:00.000Z',
    }, expect.objectContaining({
      env: READY_ENV,
      executedBy: 'founder@example.com',
    }));
  });

  it('rejects caller-supplied approval JSON before the authority store is touched', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:buffer-test-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });
    const dispatch = vi.fn(async () => dispatched());
    const forged = {
      ...request(),
      approval: { approval_id: 'caller-forged', publish_anything: true },
    };

    const result = await dispatchAuthoritativeN8nFounderContent(forged, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      env: READY_ENV,
      approvalRepository: store,
      dispatch,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('caller-supplied approval objects are forbidden');
    expect(store.claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not burn one-shot authority when n8n transport is disabled', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:buffer-test-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });
    const dispatch = vi.fn(async () => dispatched());

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      env: {},
      approvalRepository: store,
      dispatch,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('ORCHESTRATION_DISABLED');
    expect(result.reasons.join(' ')).toContain('did not consume the one-shot approval');
    expect(store.claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not consume approval for a provider/platform mismatch', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:buffer-test-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });
    const dispatch = vi.fn(async () => dispatched());

    const result = await dispatchAuthoritativeN8nFounderContent({
      ...request(),
      n8n_provider: 'tiktok',
    }, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      env: { ...READY_ENV, N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer,tiktok' },
      approvalRepository: store,
      dispatch,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_ENVELOPE');
    expect(store.claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('stops before n8n when FCR cannot atomically claim current approval authority', async () => {
    const store = repository({
      ok: false,
      code: 'APPROVAL_NOT_CURRENT',
      reason: 'authoritative approval is expired, revoked, or already consumed',
    });
    const dispatch = vi.fn(async () => dispatched());

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      env: READY_ENV,
      approvalRepository: store,
      dispatch,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_AUTHORIZATION');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
