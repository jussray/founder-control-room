import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REASONING_STAGE_ORDER,
  cookieBoundaryFingerprint,
  createReasoningRunReceipt,
  type ReasoningRunInput,
} from '../../reasoningRuns/reasoningRun.js';

const {
  mockFrom,
  mockInsert,
  mockSelect,
  mockEq,
  mockMaybeSingle,
  mockStoreBuildEvent,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockStoreBuildEvent: vi.fn(),
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('../buildEventStore.js', () => ({
  storeBuildEvent: mockStoreBuildEvent,
}));

import { storeReasoningRun } from '../reasoningRunStore.js';

const SHA = 'a'.repeat(40);

function stages() {
  return REASONING_STAGE_ORDER.map((id) => ({
    id,
    status: 'completed' as const,
    truth: 'verified' as const,
    resultCode: `${id}.complete`,
  }));
}

function input(overrides: Partial<ReasoningRunInput> = {}): ReasoningRunInput {
  return {
    chainId: 'sekret-production-audit',
    occurredAt: '2026-08-16T06:00:00Z',
    projectSlug: 'sekret-bip',
    repository: 'jussray/Sekret-Bip',
    source: 'chatgpt',
    intent: {
      goalCode: 'audit-production-truth',
      targetClass: 'project',
      requestedModes: ['ultrathink', 'redteam', 'ooda', 'l99'],
    },
    iteration: 1,
    stopReason: 'continue',
    currentHeadSha: SHA,
    stages: stages(),
    auth: {
      transport: 'bearer',
      cookieBoundaryContract: 'fcr/cookie-boundary@v1',
      cookieBoundaryFingerprint: cookieBoundaryFingerprint('bearer'),
      rawCookieValuesStored: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const chain = {
    insert: mockInsert,
    select: mockSelect,
    eq: mockEq,
    maybeSingle: mockMaybeSingle,
  };
  mockFrom.mockReturnValue(chain);
  mockSelect.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockInsert.mockResolvedValue({ error: null });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockStoreBuildEvent.mockResolvedValue('stored');
});

describe('reasoning run persistence', () => {
  it('stores V1 in the deterministic chain slot and emits a project-bound BuildEvent', async () => {
    const disposition = await storeReasoningRun('project-1', input());

    expect(disposition).toBe('stored');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      source_event_id: 'fcr/reasoning-run@v1:sekret-production-audit:v1',
      event_type: 'reasoning_run_receipt',
      screen: 'founder-reasoning-workflow',
    }));
    expect(mockStoreBuildEvent).toHaveBeenCalledWith('project-1', expect.objectContaining({
      eventId: 'reasoning:sekret-production-audit:v1',
      repository: {
        name: 'jussray/Sekret-Bip',
        commitSha: SHA,
      },
      evidenceRefs: expect.arrayContaining([
        'reasoning-chain:sekret-production-audit:v1',
        expect.stringMatching(/^intent-fingerprint:[0-9a-f]{64}$/),
      ]),
    }));
  });

  it('loads V1 from the deterministic slot before accepting V2', async () => {
    const prior = createReasoningRunReceipt(input());
    mockMaybeSingle.mockResolvedValue({ data: { metadata: prior }, error: null });

    const v2 = input({
      iteration: 2,
      priorReceiptFingerprint: prior.receiptFingerprint,
      stopReason: 'stable',
    });

    await expect(storeReasoningRun('project-1', v2)).resolves.toBe('stored');
    expect(mockEq).toHaveBeenCalledWith(
      'source_event_id',
      'fcr/reasoning-run@v1:sekret-production-audit:v1',
    );
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      source_event_id: 'fcr/reasoning-run@v1:sekret-production-audit:v2',
    }));
  });

  it('rejects a prior receipt for a different sanitized intent before writing V2', async () => {
    const unrelated = createReasoningRunReceipt(input({
      intent: {
        goalCode: 'different-founder-goal',
        targetClass: 'project',
        requestedModes: ['ooda'],
      },
    }));
    mockMaybeSingle.mockResolvedValue({ data: { metadata: unrelated }, error: null });

    const v2 = input({
      iteration: 2,
      priorReceiptFingerprint: unrelated.receiptFingerprint,
      stopReason: 'stable',
    });

    await expect(storeReasoningRun('project-1', v2))
      .rejects.toThrow('reasoning_run_prior_receipt_mismatch');
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockStoreBuildEvent).not.toHaveBeenCalled();
  });

  it.each(['stable', 'blocked', 'authority-gate'] as const)(
    'treats prior stop reason %s as terminal and rejects a successor',
    async (stopReason) => {
      const terminal = createReasoningRunReceipt(input({ stopReason }));
      mockMaybeSingle.mockResolvedValue({ data: { metadata: terminal }, error: null });

      const v2 = input({
        iteration: 2,
        priorReceiptFingerprint: terminal.receiptFingerprint,
        stopReason: 'stable',
      });

      await expect(storeReasoningRun('project-1', v2))
        .rejects.toThrow('reasoning_run_prior_receipt_mismatch');
      expect(mockInsert).not.toHaveBeenCalled();
    },
  );

  it('uses one unique source-event slot per chain iteration so a competing fork becomes conflict', async () => {
    const firstV1 = createReasoningRunReceipt(input());
    mockInsert.mockResolvedValue({ error: { code: '23505' } });
    mockMaybeSingle.mockResolvedValue({ data: { metadata: firstV1 }, error: null });

    await expect(storeReasoningRun('project-1', {
      ...input(),
      intent: {
        goalCode: 'different-founder-goal',
        targetClass: 'project',
        requestedModes: ['l99'],
      },
    })).resolves.toBe('conflict');

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      source_event_id: 'fcr/reasoning-run@v1:sekret-production-audit:v1',
    }));
    expect(mockStoreBuildEvent).not.toHaveBeenCalled();
  });
});
