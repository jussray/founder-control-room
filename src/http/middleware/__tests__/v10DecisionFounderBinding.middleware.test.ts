import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import { requireV10DecisionFounderBinding } from '../v10DecisionFounderBinding.js';

const MISSION_ID = 'mission-v10-merge';
const SHA = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);

function requestShape() {
  return {
    body: {
      actionType: 'merge',
      payload: {
        _v10: {
          capabilityPlanHash: PLAN_HASH,
          expectedHeadSha: SHA,
          projectSlug: 'founder-control-room',
        },
      },
    },
    params: { missionId: MISSION_ID },
    founder: { email: 'founder@example.com' },
    headers: {},
    header: vi.fn().mockReturnValue(null),
  };
}

function responseShape() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockImplementation((code: number) => {
    response.statusCode = code;
    return response;
  });
  response.json.mockImplementation((body: unknown) => {
    response.body = body;
    return response;
  });
  return response;
}

function proofLookup(result: { data: unknown; error: { message: string } | null }) {
  const chain = {
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return { select: vi.fn().mockReturnValue(chain) };
}

describe('V10 trusted founder approval middleware readback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed when no persisted passing merge proof can be read back', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'proof_gate_results') return proofLookup({ data: null, error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    const response = responseShape();
    const next = vi.fn();

    await requireV10DecisionFounderBinding(
      requestShape() as never,
      response as never,
      next,
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({ code: 'V10_TRUSTED_APPROVAL_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed when trusted approval persistence is unavailable', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'proof_gate_results') {
        return proofLookup({ data: null, error: { message: 'database unavailable' } });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const response = responseShape();
    const next = vi.fn();

    await requireV10DecisionFounderBinding(
      requestShape() as never,
      response as never,
      next,
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      code: 'V10_TRUSTED_APPROVAL_UNAVAILABLE',
      detail: 'database unavailable',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
