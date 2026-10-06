import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  supabaseMock,
  runCouncilRoundMock,
  providerForProjectMock,
  getRefMock,
  bridgeReadinessMock,
  dispatchBridgeMock,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  runCouncilRoundMock: vi.fn(),
  providerForProjectMock: vi.fn(),
  getRefMock: vi.fn(),
  bridgeReadinessMock: vi.fn(),
  dispatchBridgeMock: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../lib/councilRound.js', () => ({ runCouncilRound: runCouncilRoundMock }));
vi.mock('../../../lib/operatorRelayModelProviders.js', () => ({ createServerOperatorRelayAdapters: () => ({}) }));
vi.mock('../../../providers/providerFactory.js', () => ({ providerForProject: providerForProjectMock }));
vi.mock('../../../lib/courtWitnessBridge.js', () => ({
  courtWitnessBridgeReadiness: bridgeReadinessMock,
  dispatchCourtWitnessBridge: dispatchBridgeMock,
}));

import express from 'express';
import request from 'supertest';
import { missionsRouter } from '../missions.js';

const FOUNDER_EMAIL = 'founder@example.com';
const MISSION_ID = 'mission-court-witness';
const PROJECT_ID = 'project-1';
const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/missions', missionsRouter);
  return instance;
}

function missionRow() {
  return {
    id: MISSION_ID,
    project_id: PROJECT_ID,
    base_ref: 'main',
    branch_ref: 'mission/test',
  };
}

function projectRow() {
  return {
    id: PROJECT_ID,
    slug: 'founder-control-room',
    name: 'Founder Control Room',
    repo_provider: 'github',
    repo_identifier: 'jussray/founder-control-room',
  };
}

function bridgeSuccess() {
  return {
    ok: true,
    code: 'COMPLETE',
    status: 200,
    contract: 'fcr/court-witness-bridge@v1',
    subject: {
      caseId: `mission:${MISSION_ID}:round:5`,
      repository: 'jussray/founder-control-room',
      branch: 'mission/test',
      headSha: HEAD_A,
    },
    kody: {
      receipt: { receiptFingerprint: '1'.repeat(64) },
    },
    sol: {
      marker: { continuity_fingerprint: '2'.repeat(64) },
    },
    promptos: {
      result: { workflowFingerprint: '3'.repeat(64) },
    },
    reasons: [],
  };
}

function wireDatabase() {
  const auditRows: Record<string, any>[] = [];
  const councilRows: Record<string, any>[] = [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
          }),
        }),
      };
    }
    if (table === 'missions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: missionRow(), error: null }),
          }),
        }),
      };
    }
    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: projectRow(), error: null }),
          }),
        }),
      };
    }
    if (table === 'council_conversations') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: { round: 4 }, error: null }),
              }),
            }),
          }),
        }),
        insert: (row: Record<string, any>) => {
          councilRows.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'c-live', ...row }, error: null }),
            }),
          };
        },
      };
    }
    if (table === 'project_events') {
      return {
        insert: (row: Record<string, any>) => {
          auditRows.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    return {};
  });

  return { auditRows, councilRows };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: FOUNDER_EMAIL } },
    error: null,
  });
  bridgeReadinessMock.mockReturnValue({
    enabled: true,
    ready: true,
    missingBindings: [],
    reasons: [],
  });
  providerForProjectMock.mockReturnValue({ getRef: getRefMock });
  getRefMock.mockResolvedValue({ name: 'mission/test', commitSha: HEAD_A });
  dispatchBridgeMock.mockResolvedValue(bridgeSuccess());

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
        seedSha256: '4'.repeat(64),
        hops: [{
          index: 0,
          relayId: 'relay-1',
          fromOperator: 'fcr',
          toOperator: 'codex',
          capability: 'propose',
          requestHash: '5'.repeat(64),
          responseHash: '6'.repeat(64),
          status: 'completed',
          inputSha256: '7'.repeat(64),
          answerSha256: '8'.repeat(64),
          answer: 'provider answer',
          evidenceRefs: ['provider:openai:r1'],
          liveProviderEvidence: true,
          completedAt: '2026-10-06T05:00:01.000Z',
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

describe('Council witness federation', () => {
  it('resolves exact head before Council, rechecks it after, and dispatches a bounded witness packet', async () => {
    const { auditRows } = wireDatabase();

    const response = await request(app())
      .post(`/missions/${MISSION_ID}/council/run`)
      .set('Authorization', 'Bearer test-token')
      .send({
        goal: 'Return one Council recommendation.',
        seed: 'Founder-attested input.',
        participants: ['codex'],
        sourceRef: 'caller-loose-ref-must-not-become-proof',
      });

    expect(response.status).toBe(201);
    expect(getRefMock).toHaveBeenCalledTimes(2);
    expect(runCouncilRoundMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceRef: `repo:jussray/founder-control-room#mission/test@${HEAD_A}`,
      missionId: MISSION_ID,
      round: 5,
    }), {});
    expect(dispatchBridgeMock).toHaveBeenCalledTimes(1);

    const packet = dispatchBridgeMock.mock.calls[0]?.[0];
    expect(packet.repository).toBe('jussray/founder-control-room');
    expect(packet.branch).toBe('mission/test');
    expect(packet.headSha).toBe(HEAD_A);
    expect(packet.witnesses.map((w: any) => [w.class, w.status])).toEqual([
      ['repository_source', 'VERIFIED'],
      ['execution_receipt', 'VERIFIED'],
    ]);
    expect(packet.witnesses[1].limitation).toMatch(/does not prove peer answer truth/);

    expect(response.body.witnessBridge.result.code).toBe('COMPLETE');
    expect(response.body.witnessBridge.auditPersisted).toBe(true);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].event_type).toBe('council_witness_bridge_completed');
    expect(auditRows[0].metadata).toMatchObject({
      mission_id: MISSION_ID,
      round: 5,
      bridge_code: 'COMPLETE',
      repository: 'jussray/founder-control-room',
      branch: 'mission/test',
      head_sha: HEAD_A,
      kody_receipt_fingerprint: '1'.repeat(64),
      sol_continuity_fingerprint: '2'.repeat(64),
      promptos_workflow_fingerprint: '3'.repeat(64),
      authority: 'evidence-only',
    });
  });

  it('blocks downstream federation when the exact head moves during Council', async () => {
    const { auditRows } = wireDatabase();
    getRefMock
      .mockResolvedValueOnce({ name: 'mission/test', commitSha: HEAD_A })
      .mockResolvedValueOnce({ name: 'mission/test', commitSha: HEAD_B });

    const response = await request(app())
      .post(`/missions/${MISSION_ID}/council/run`)
      .set('Authorization', 'Bearer test-token')
      .send({
        goal: 'Challenge current evidence.',
        participants: ['codex'],
      });

    expect(response.status).toBe(201);
    expect(runCouncilRoundMock).toHaveBeenCalledTimes(1);
    expect(dispatchBridgeMock).not.toHaveBeenCalled();
    expect(response.body.witnessBridge.result.code).toBe('EVIDENCE_SUBJECT_MOVED');
    expect(response.body.witnessBridge.result.reasons[0]).toMatch(/moved during the Council round/);
    expect(auditRows[0].event_type).toBe('council_witness_bridge_blocked');
    expect(auditRows[0].metadata.stage).toBe('postflight');
    expect(auditRows[0].metadata.head_sha).toBe(HEAD_B);
  });

  it('fails before Council provider calls when the exact repository subject cannot be resolved', async () => {
    const { auditRows } = wireDatabase();
    getRefMock.mockRejectedValue(new Error('repository provider unavailable'));

    const response = await request(app())
      .post(`/missions/${MISSION_ID}/council/run`)
      .set('Authorization', 'Bearer test-token')
      .send({
        goal: 'Challenge current evidence.',
        participants: ['codex'],
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('COUNCIL_WITNESS_SUBJECT_UNAVAILABLE');
    expect(runCouncilRoundMock).not.toHaveBeenCalled();
    expect(dispatchBridgeMock).not.toHaveBeenCalled();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].event_type).toBe('council_witness_bridge_blocked');
    expect(auditRows[0].metadata.stage).toBe('preflight');
  });

  it('fails before repository or Council work when the enabled bridge configuration is incomplete', async () => {
    const { auditRows } = wireDatabase();
    bridgeReadinessMock.mockReturnValue({
      enabled: true,
      ready: false,
      missingBindings: ['PROMPTOS_COURT_BRIDGE_KEY'],
      reasons: ['Court witness bridge requires: PROMPTOS_COURT_BRIDGE_KEY'],
    });

    const response = await request(app())
      .post(`/missions/${MISSION_ID}/council/run`)
      .set('Authorization', 'Bearer test-token')
      .send({
        goal: 'Challenge current evidence.',
        participants: ['codex'],
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('COUNCIL_WITNESS_BRIDGE_NOT_READY');
    expect(providerForProjectMock).not.toHaveBeenCalled();
    expect(runCouncilRoundMock).not.toHaveBeenCalled();
    expect(dispatchBridgeMock).not.toHaveBeenCalled();
    expect(auditRows[0].metadata.stage).toBe('preflight');
  });
});
