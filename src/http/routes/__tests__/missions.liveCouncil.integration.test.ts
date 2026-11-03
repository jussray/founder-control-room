import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, runCouncilRoundMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  runCouncilRoundMock: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../lib/councilRound.js', () => ({ runCouncilRound: runCouncilRoundMock }));
vi.mock('../../../lib/operatorRelayModelProviders.js', () => ({ createServerOperatorRelayAdapters: () => ({}) }));

import express from 'express';
import request from 'supertest';
import { missionsRouter } from '../missions.js';

const FOUNDER_EMAIL = 'founder@example.com';
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
  runCouncilRoundMock.mockImplementation(async (input: any) => {
    const row = {
      mission_id: input.missionId,
      round: input.round,
      participants: ['fcr', ...input.seats.map((seat: any) => seat.operator)],
      transcript: {
        contract: 'fcr.council-round.v1',
        goal: input.goal,
        initiator: input.initiator,
        sourceRef: input.sourceRef,
        seedSha256: 'a'.repeat(64),
        hops: [{
          index: 0,
          relayId: 'relay-1',
          fromOperator: 'fcr',
          toOperator: 'codex',
          capability: 'propose',
          requestHash: 'b'.repeat(64),
          responseHash: 'c'.repeat(64),
          status: 'completed',
          inputSha256: 'd'.repeat(64),
          answerSha256: 'e'.repeat(64),
          answer: 'provider answer',
          evidenceRefs: ['provider:openai:r1'],
          liveProviderEvidence: true,
          completedAt: '2026-10-05T16:00:01.000Z',
        }],
        humanRelay: false,
        state: 'complete',
        nextSeatIndex: input.seats.length,
        interruption: null,
      },
      outcome: 'provider answer',
    };
    await input.persist(row);
    return row;
  });
});

describe('POST /missions/:missionId/council/run', () => {
  it('executes through FCR and persists the provenance-bound Council row', async () => {
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
      .set('Authorization', 'Bearer test-token')
      .send({
        goal: 'Return one Council recommendation.',
        seed: 'Claude-originated founder-attested input.',
        participants: ['codex', 'claude-code', 'muse'],
        sourceRef: 'founder-attested:claude-code',
      });

    expect(response.status).toBe(201);
    expect(response.body.relay.transcript.humanRelay).toBe(false);
    expect(response.body.relay.transcript.sourceRef).toBe('founder-attested:claude-code');
    expect(runCouncilRoundMock).toHaveBeenCalledWith(expect.objectContaining({
      initiator: 'fcr',
      sourceRef: 'founder-attested:claude-code',
      missionId: MISSION_ID,
      round: 5,
    }), {});
    const persisted = inserted as unknown as { transcript: { sourceRef: string; humanRelay: boolean } };
    expect(persisted.transcript.sourceRef).toBe('founder-attested:claude-code');
    expect(persisted.transcript.humanRelay).toBe(false);
  });
});
