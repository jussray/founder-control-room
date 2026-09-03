import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reserveCadence, applyCadence } = vi.hoisted(() => ({
  reserveCadence: vi.fn(),
  applyCadence: vi.fn(),
}));

vi.mock('../founderContentCadence.js', () => ({
  reserveFounderContentCadence: reserveCadence,
  applyFounderContentCadenceSchedule: applyCadence,
}));

const { fakeDb } = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string; status: string; started_at: string };

  function build() {
    const rows = new Map<string, Row>();
    let nextId = 1;
    const projectRow = { id: 'p-1', repo_identifier: 'jussray/founder-control-room' };

    function filterValue(row: Row, column: string): unknown {
      if (column === 'result->>provider_write_attempted') {
        const result = row.result && typeof row.result === 'object' && !Array.isArray(row.result)
          ? row.result as Record<string, unknown>
          : {};
        return result.provider_write_attempted;
      }
      return (row as Record<string, unknown>)[column];
    }

    function matchesFilters(row: Row, filters: Array<[string, unknown]>): boolean {
      return filters.every(([col, val]) => String(filterValue(row, col)) === String(val));
    }

    function findByFilters(filters: Array<[string, unknown]>): Row | null {
      for (const row of rows.values()) {
        if (matchesFilters(row, filters)) return row;
      }
      return null;
    }

    function from(table: string) {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [projectRow], error: null }),
            }),
          }),
        };
      }
      if (table === 'approval_executions') {
        return {
          select: (_cols: string) => {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq: (col: string, val: unknown) => { filters.push([col, val]); return builder; },
              maybeSingle: async () => ({ data: findByFilters(filters), error: null }),
            };
            return builder;
          },
          insert: (payload: Record<string, unknown>) => ({
            select: (_cols: string) => ({
              single: async () => {
                const id = String(nextId++);
                const row = { ...payload, id } as Row;
                rows.set(id, row);
                return { data: { id: row.id, started_at: row.started_at }, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq: (col: string, val: unknown) => { filters.push([col, val]); return builder; },
              select: (_cols: string) => ({
                maybeSingle: async () => {
                  const matched = findByFilters(filters);
                  if (!matched) return { data: null, error: null };
                  Object.assign(matched, payload);
                  return {
                    data: { id: matched.id, project_id: matched.project_id, started_at: matched.started_at },
                    error: null,
                  };
                },
              }),
            };
            return builder;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    }

    return { from, __rows: rows };
  }

  return { fakeDb: build() };
});

vi.mock('../supabaseClient.js', () => ({ supabase: fakeDb }));

import {
  finalizeN8nFounderContentExecution,
  type VerifiedN8nFounderContentReceipt,
} from '../n8nFounderContentOrchestrator.js';
import { prepareProviderNeutralN8nFounderContent } from '../n8nProviderNeutralFounderContentPreparation.js';

const require = createRequire(import.meta.url);
const {
  canonicalChiefIdentity,
  hashPublicPayload,
} = require('../../../tools/founder-content-contracts/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity(value: Record<string, unknown>): unknown;
  hashPublicPayload(value: unknown): string;
};

const SOURCE_SHA = 'd'.repeat(40);
const NOW = '2026-08-18T01:30:00.000Z';
const APPROVAL_EXPIRES_AT = '2026-08-18T02:10:00.000Z';
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#reservation-fencing`;

function proposal(): Record<string, unknown> {
  const value: Record<string, unknown> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-18T01:00:00.000Z',
      expires_at: '2026-08-18T02:30:00.000Z',
    },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'Verified founder progress bound to an exact historical repository version.',
      public_claims: [{
        claim_id: 'reservation-fencing-proof',
        text: 'The LinkedIn founder update was bound to a verified historical repository version.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: EVIDENCE_REF,
        evidence_scope: 'provider-neutral-social-contract',
        temporal_class: 'historical_version',
        temporal_version: SOURCE_SHA,
      }],
      proof_link: null,
      proof_link_policy: 'editorial_optional',
    },
    internal_evidence: {
      verified: true,
      ref: EVIDENCE_REF,
      kind: 'github-exact-head-contract',
      digest: 'e'.repeat(64),
      not_for_publication: true,
      source_repo: 'jussray/founder-control-room',
      source_commit_sha: SOURCE_SHA,
      proves: ['provider-neutral-social-contract'],
      does_not_prove: ['provider-runtime', 'publication', 'traction'],
    },
    sauce_guard: {
      scanner_version: 'sauce-guard-v1',
      private_implementation_removed: true,
      secret_material_removed: true,
      raw_diff_removed: true,
      private_metrics_removed: true,
      unreleased_roadmap_removed: true,
      customer_private_data_removed: true,
      security_sensitive_details_removed: true,
      public_claims_only: true,
      independent_scan_passed: true,
      blocked_categories: [],
      withheld_categories: ['private-implementation'],
    },
    authority: {
      proposal_only: true,
      publish_authorized: false,
      current_you_source: 'current_authenticated_founder',
      current_you_intent_id: 'founder-content-current',
      current_you_intent_version: 9,
      current_you_observed_at: '2026-08-18T01:05:00.000Z',
      proposal_evaluated_at: '2026-08-18T01:10:00.000Z',
      future_you_advisory_only: true,
      historical_content_intent_authoritative: false,
      analytics_feedback_authority: 'observation-only',
      analytics_can_authorize_publish: false,
      external_feedback_trusted_for_authority: false,
    },
  };
  value.proposal_hash = hashPublicPayload(canonicalChiefIdentity(value));
  return value;
}

function approval(proposed: Record<string, unknown>) {
  return {
    approval_id: 'approval-linkedin-fencing',
    proposal_hash: proposed.proposal_hash,
    public_payload_hash: hashPublicPayload((proposed.public_payload as Record<string, unknown>)),
    channels: ['linkedin'],
    approved_at: '2026-08-18T01:20:00.000Z',
    expires_at: APPROVAL_EXPIRES_AT,
    revoked: false,
    used: false,
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: 'publish-linkedin-fencing',
      intent_version: 10,
      observed_at: '2026-08-18T01:19:00.000Z',
      supersedes_stale_content_intent: true,
    },
  };
}

function successfulFetchImpl(): typeof fetch {
  return vi.fn(async (_url, init: RequestInit) => {
    const activeRow = [...fakeDb.__rows.values()][0];
    const activeResult = activeRow?.result && typeof activeRow.result === 'object' && !Array.isArray(activeRow.result)
      ? activeRow.result as Record<string, unknown>
      : {};
    expect(activeResult.provider_write_attempted).toBe(true);

    const sentBody = JSON.parse(String(init.body)) as { orchestrationId: string };
    return {
      ok: true,
      json: async () => ({
        orchestrationId: sentBody.orchestrationId,
        provider: 'buffer',
        state: 'scheduled',
        providerItemId: 'buffer-item-1',
      }),
    } as Response;
  }) as unknown as typeof fetch;
}

function prepareInput() {
  const proposed = proposal();
  return {
    n8n_provider: 'buffer',
    proposal: proposed,
    approval: approval(proposed),
    now: NOW,
  };
}

const env = {
  N8N_FOUNDER_CONTENT_ENABLED: 'true',
  N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
  N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'server-only-test-token',
  N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
};

describe('n8n prepared-reservation abort/finalize generation fencing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.__rows.clear();
    reserveCadence.mockResolvedValue({});
    applyCadence.mockImplementation((envelope: { provider_request: { schedule_at: string } }) => ({
      provider_request: { schedule_at: envelope.provider_request.schedule_at },
    }));
  });

  it('lets only the rearmed reservation generation acquire approval authority and cross the provider-write boundary', async () => {
    const input = prepareInput();
    const fetchImpl = successfulFetchImpl();

    const preparedA = await prepareProviderNeutralN8nFounderContent(input, { env, executedBy: 'founder@example.com', fetchImpl });
    if (!preparedA.prepared) throw new Error(`worker A did not prepare: ${JSON.stringify(preparedA.result.reasons)}`);

    const rowAfterA = [...fakeDb.__rows.values()][0];
    expect(rowAfterA).toBeTruthy();
    const generationA = String(rowAfterA.started_at);

    const recoveryAuthorizedAt = new Date(new Date(generationA).getTime() + 2 * 60 * 1000).toISOString();

    const preparedB = await prepareProviderNeutralN8nFounderContent(input, {
      env,
      executedBy: 'founder@example.com',
      preclaimRecoveryAuthorizedAt: recoveryAuthorizedAt,
      fetchImpl,
    });
    if (!preparedB.prepared) throw new Error(`worker B did not prepare: ${JSON.stringify(preparedB.result.reasons)}`);

    expect(preparedB.executionId).toBe(preparedA.executionId);
    const rowAfterRearm = fakeDb.__rows.get(preparedB.executionId)!;
    expect(String(rowAfterRearm.started_at)).not.toBe(generationA);
    expect(rowAfterRearm.status).toBe('pending');

    const staleClaimBoundary = await preparedA.acquireApprovalClaimBoundary();
    expect(staleClaimBoundary).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(fakeDb.__rows.get(preparedB.executionId)!.status).toBe('pending');

    const activeClaimBoundary = await preparedB.acquireApprovalClaimBoundary();
    expect(activeClaimBoundary).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(0);

    const staleDispatch = await preparedA.dispatch();
    expect(staleDispatch.ok).toBe(false);
    expect(staleDispatch.code).toBe('ACTION_AUDIT_INCOMPLETE');
    expect(staleDispatch.reasons.join(' ')).toContain('no provider request was attempted');
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(fakeDb.__rows.get(preparedB.executionId)!.status).toBe('pending');

    const abortedByA = await preparedA.abort('worker A lost the approval claim race');
    expect(abortedByA).toBe(false);
    expect(fakeDb.__rows.get(preparedB.executionId)!.status).toBe('pending');

    const staleReceipt: VerifiedN8nFounderContentReceipt = {
      orchestrationId: preparedA.request.orchestrationId,
      provider: 'buffer',
      state: 'scheduled',
      providerItemId: 'stale-worker-item',
      providerRequestId: null,
      truthState: 'provider_schedule_receipt_pending_readback',
      published: false,
      requiresProviderReadback: true,
    };
    const finalizedByA = await finalizeN8nFounderContentExecution(preparedA.executionId, staleReceipt, generationA);
    expect(finalizedByA).toBe(false);
    expect(fakeDb.__rows.get(preparedB.executionId)!.status).toBe('pending');

    const dispatchResult = await preparedB.dispatch();

    expect(dispatchResult.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const finalRow = fakeDb.__rows.get(preparedB.executionId)!;
    expect(finalRow.status).toBe('succeeded');
    expect(finalRow.result).toEqual(expect.objectContaining({ provider_write_attempted: true }));
  });

  it('allows at most one provider request for duplicate dispatch attempts on the same generation', async () => {
    const input = prepareInput();
    const fetchImpl = successfulFetchImpl();

    const prepared = await prepareProviderNeutralN8nFounderContent(input, {
      env,
      executedBy: 'founder@example.com',
      fetchImpl,
    });
    if (!prepared.prepared) throw new Error(`worker did not prepare: ${JSON.stringify(prepared.result.reasons)}`);

    const [first, second] = await Promise.all([
      prepared.dispatch(),
      prepared.dispatch(),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const blocked = first.ok ? second : first;
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('ACTION_AUDIT_INCOMPLETE');
    expect(blocked.reasons.join(' ')).toContain('no provider request was attempted');

    const finalRow = fakeDb.__rows.get(prepared.executionId)!;
    expect(finalRow.status).toBe('succeeded');
    expect(finalRow.result).toEqual(expect.objectContaining({ provider_write_attempted: true }));
  });
});
