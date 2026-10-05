import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, runLiveCouncilRelayMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  runLiveCouncilRelayMock: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../lib/councilRelay.js', () => ({ runLiveCouncilRelay: runLiveCouncilRelayMock }));
vi.mock('../../../lib/operatorRelayModelProviders.js', () => ({ createServerOperatorRelayAdapters: () => ({}) }));

import express from 'express';
import request from 'supertest';
import { missionsRouter } from '../missions.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const MISSION_ID = 'mission-live-council';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/missions', missionsRouter);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: FOUNDER_EMAIL } }, error: null });
  runLiveCouncilRelayMock.mockResolvedValue({
    contract: 'juss/live-council-relay@v1',
    originRef: 'founder-attested:claude-code',
    status: 'completed',
    participants: ['codex', 'claude-code', 'muse'],
    completedParticipants: ['codex', 'claude-code', 'muse'],
    blockedParticipants: [],
    hops: [{ seat: 'codex', source: 'fcr', originRef: 'founder-attested:claude-code', status: 'completed', requestHash: 'a'.repeat(64), responseHash: 'b'.repeat(64), answer: 'one', evidenceRefs: ['provider:openai:r1'], unresolved: [], failureCode: null }],
    finalAnswer: 'three',
    evidenceRefs: ['provider:openai:r1', 'provider:anthropic:r2', 'provider:muse:r3'],
  });
});

describe('POST /missions/:missionId/council/run', () => {
  it('executes and persists a provider-bound Council receipt', async () => {
    let inserted: Record<string, any> | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }) }) }) };
      }
      if (table === 'missions') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: MISSION_ID, project_id: 'project-1' }, error: null }) }) }) };
      }
      if (table === 'council_conversations') {
        return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { round: 4 }, error: null }) }) }) }) }),
          insert: (row: Record<string, any>) => {
            inserted = row;
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'c-live', ...row }, error: null }) }) };
          },
        };
      }
      return {};
    });

    const response = await request(app())
      .post(`/missions/${MISSION_ID}/council/run`)
      .set('Authorization', BEARER)
      .send({
        goal: 'Return the Council recommendation.',
        contextSummary: 'Use bounded provider relay.',
        participants: ['codex', 'claude-code', 'muse'],
        sourceRef: 'founder-attested:claude-code',
      });

    expect(response.status).toBe(201);
    expect(response.body.relay.status).toBe('completed');
    expect(response.body.relay.originRef).toBe('founder-attested:claude-code');
    expect(inserted).toMatchObject({
      mission_id: MISSION_ID,
      round: 5,
      participants: ['codex', 'claude-code', 'muse'],
      outcome: 'live_relay_completed',
    });
    const persisted = inserted as unknown as {
      transcript: {
        contract: string;
        evidenceRefs: string[];
        hops: Array<{ originRef?: string | null }>;
      };
    };
    expect(persisted.transcript.contract).toBe('juss/live-council-relay@v1');
    expect(persisted.transcript.evidenceRefs).toContain('provider:muse:r3');
    expect(persisted.transcript.hops[0]?.originRef).toBe('founder-attested:claude-code');
  });
});
