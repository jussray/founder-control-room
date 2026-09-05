import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuthoritativeN8n,
  mockAuthoritativePublish,
  mockIssueApproval,
  mockFingerprintGate,
  mockGetUser,
  supabaseMock,
} = vi.hoisted(() => ({
  mockAuthoritativeN8n: vi.fn(),
  mockAuthoritativePublish: vi.fn(),
  mockIssueApproval: vi.fn(),
  mockFingerprintGate: vi.fn(),
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../lib/authoritativeN8nFounderContentPublisher.js', () => ({
  dispatchAuthoritativeN8nFounderContent: mockAuthoritativeN8n,
}));
vi.mock('../../../lib/authoritativeFounderContentPublisher.js', () => ({
  dispatchAuthoritativeFounderContentPublishNow: mockAuthoritativePublish,
}));
vi.mock('../../../lib/founderContentApprovalStore.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/founderContentApprovalStore.js')>(
    '../../../lib/founderContentApprovalStore.js',
  );
  return { ...actual, issueFounderContentApproval: mockIssueApproval };
});
vi.mock('../../../lib/founderContentFingerprintGate.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/founderContentFingerprintGate.js')>(
    '../../../lib/founderContentFingerprintGate.js',
  );
  return { ...actual, evaluateFounderContentFingerprintGate: mockFingerprintGate };
});

import express from 'express';
import request from 'supertest';
import { n8nConveyorRouter } from '../n8nConveyor.js';
import { FOUNDER_CONTENT_FINGERPRINT_GATE_CONTRACT } from '../../../lib/founderContentFingerprintGate.js';

const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/automation/conveyor', n8nConveyorRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: 'founder@example.com' } },
    error: null,
  });
  supabaseMock.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: 'founder@example.com' }, error: null }),
      }),
    }),
  }));
  mockFingerprintGate.mockResolvedValue({
    contract: FOUNDER_CONTENT_FINGERPRINT_GATE_CONTRACT,
    gate: 'HOLD',
    candidate: {
      project: 'Founder Control Room',
      platform: 'linkedin',
      topic: 'runtime identity',
      differentiatedThesis: 'A distinct thesis.',
      format: 'VIDEO',
      formatRationale: 'Show the proof flow.',
    },
    recent: { hooks: [], topics: [], ctas: [], formats: [], performanceSignals: [] },
    ruledOutAngles: [],
    coverage: { linkedin: true, otherSocial: false, formatHistory: false },
    closestMatchId: null,
    closestSimilarity: 0,
    reasons: [
      'Recent non-LinkedIn social history has not been checked.',
      'Recent format history has not been checked.',
    ],
    authority: { draft: false, approve: false, schedule: false, publish: false },
  });
});

describe('founder-content pre-draft fingerprint route', () => {
  it('exposes a founder-authenticated non-authorizing server-history preview', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/pre-draft-fingerprint')
      .set('Authorization', BEARER)
      .send({
        project: 'Founder Control Room',
        platform: 'linkedin',
        topic: 'runtime identity',
        differentiatedThesis: 'A distinct thesis.',
        format: 'video',
        formatRationale: 'Show the proof flow.',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      contract: FOUNDER_CONTENT_FINGERPRINT_GATE_CONTRACT,
      packet: expect.objectContaining({ gate: 'HOLD' }),
      authority: { draft: false, approve: false, schedule: false, publish: false },
    }));
    expect(mockFingerprintGate).toHaveBeenCalledWith({
      candidate: {
        project: 'Founder Control Room',
        platform: 'linkedin',
        topic: 'runtime identity',
        differentiatedThesis: 'A distinct thesis.',
        format: 'VIDEO',
        formatRationale: 'Show the proof flow.',
      },
    });
  });

  it('rejects caller-supplied history instead of letting untrusted evidence manufacture PASS', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/pre-draft-fingerprint')
      .set('Authorization', BEARER)
      .send({
        project: 'Founder Control Room',
        platform: 'linkedin',
        topic: 'runtime identity',
        differentiatedThesis: 'A distinct thesis.',
        format: 'VIDEO',
        formatRationale: 'Show the proof flow.',
        history: { coverage: { linkedin: true, otherSocial: true, formatHistory: true }, records: [] },
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({
      code: 'CALLER_HISTORY_FORBIDDEN',
      authority: { draft: false, approve: false, schedule: false, publish: false },
    }));
    expect(mockFingerprintGate).not.toHaveBeenCalled();
  });

  it('fails closed when server-owned history cannot be read', async () => {
    mockFingerprintGate.mockRejectedValueOnce(new Error('history unavailable'));

    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/pre-draft-fingerprint')
      .set('Authorization', BEARER)
      .send({
        project: 'Founder Control Room',
        platform: 'linkedin',
        topic: 'runtime identity',
        differentiatedThesis: 'A distinct thesis.',
        format: 'VIDEO',
        formatRationale: 'Show the proof flow.',
      });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('FINGERPRINT_HISTORY_UNAVAILABLE');
    expect(res.body.authority).toEqual({ draft: false, approve: false, schedule: false, publish: false });
  });
});
