import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc, state } = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), state: { authenticated: true },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { from, rpc } }));
vi.mock('../../../providers/providerFactory.js', () => ({ providerForProject: vi.fn() }));
vi.mock('../../../services/repositoryEvidenceStore.js', () => ({
  persistActiveInspection: vi.fn(), persistRepositoryPacket: vi.fn(),
}));
vi.mock('../../../services/repositoryVerification.js', () => ({
  inspectRepositoryManifest: vi.fn(),
}));
vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (req: Request & { founder?: { email: string; userId: string } }, res: Response, next: NextFunction) => {
    if (!state.authenticated) return res.status(401).json({ error: 'Founder session required' });
    req.founder = { email: 'founder@example.com', userId: 'founder-fixture' };
    next();
  },
}));
import { repositoryVerificationRouter } from '../repositoryVerification.js';

const PROJECT = '10000000-0000-4000-8000-000000000001';
const RUN = '20000000-0000-4000-8000-000000000001';
const FINDING = '30000000-0000-4000-8000-000000000001';
const MISSION = '40000000-0000-4000-8000-000000000001';
const route = '/projects/sample/verification/propose-mission';
const mission = { id: MISSION, project_id: PROJECT, status: 'proposed' };
const finding = { id: FINDING, mission_id: MISSION };
let latestRun: Record<string, unknown> | null;
let readbackMissing: boolean;
let candidates: Array<{ id: string }>;

function app() {
  const server = express();
  server.use(express.json());
  server.use('/projects', repositoryVerificationRouter);
  return server;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.authenticated = true;
  readbackMissing = false;
  candidates = [{ id: FINDING }];
  latestRun = { id: RUN, branch: 'main', commit_sha: 'a'.repeat(40), signature_verified: true, overall_status: 'failed' };
  from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (field: string, value: unknown) => { filters[field] = value; return chain; },
      is: (field: string, value: unknown) => { filters[field] = value; return chain; },
      in: (field: string, value: unknown) => { filters[field] = value; return chain; },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'projects') return { data: { id: PROJECT, slug: 'sample', repo_identifier: 'sample/repo' }, error: null };
        if (table === 'repository_verification_runs') {
          expect(filters.project_id).toBe(PROJECT);
          return { data: latestRun, error: null };
        }
        if (table === 'missions') {
          expect(filters.project_id).toBe(PROJECT);
          expect(filters.id).toBe(MISSION);
          return { data: readbackMissing ? null : mission, error: null };
        }
        throw new Error('unexpected table ' + table);
      },
      then: (resolve: (value: unknown) => void) => {
        expect(table).toBe('repository_findings');
        expect(filters.project_id).toBe(PROJECT);
        if (filters.mission_id === MISSION) {
          expect(filters.id).toEqual([FINDING]);
          resolve({ data: [finding], error: null });
        } else {
          expect(filters.verification_run_id).toBe(RUN);
          expect(filters.status).toBe('open');
          expect(filters.mission_id).toBeNull();
          resolve({ data: candidates, error: null });
        }
      },
    };
    return chain;
  });
  rpc.mockResolvedValue({ data: { mission_id: MISSION, created: true, authority: 'proposal_only', mutation_authorized: false }, error: null });
});

describe('atomic repository repair proposal route', () => {
  it('creates a proposal only through the scoped RPC and returns the existing API fields', async () => {
    const result = await request(app()).post(route).send({ findingIds: [FINDING], projectId: 'attacker', requestedBy: 'attacker' });
    expect(result.status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('reserve_repository_repair_mission', {
      p_project_id: PROJECT, p_run_id: RUN, p_finding_ids: [FINDING], p_requested_by_user_id: 'founder-fixture',
    });
    expect(result.body).toMatchObject({ mission, findings: [finding], created: true, mutationAuthorized: false });
  });
  it('supports the existing empty-body UI action with bounded current-run selection', async () => {
    const result = await request(app()).post(route).send({});
    expect(result.status).toBe(201);
    expect(rpc.mock.calls[0]?.[1].p_finding_ids).toEqual([FINDING]);
  });
  it('returns 200 for an identical retry', async () => {
    rpc.mockResolvedValue({ data: { mission_id: MISSION, created: false, authority: 'proposal_only', mutation_authorized: false }, error: null });
    const result = await request(app()).post(route).send({ findingIds: [FINDING] });
    expect(result.status).toBe(200);
    expect(result.body.created).toBe(false);
  });
  it('does not fall back to writes when the function is absent', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const result = await request(app()).post(route).send({ findingIds: [FINDING] });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe('atomic_repair_reservation_unavailable');
    expect(from.mock.calls.map(call => call[0])).toEqual(['projects', 'repository_verification_runs']);
  });
  it('rejects empty, invalid, duplicate and oversized explicit selections', async () => {
    for (const findingIds of [[], ['invalid'], [FINDING, FINDING], Array(101).fill(FINDING)]) {
      const result = await request(app()).post(route).send({ findingIds });
      expect(result.status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects missing or unsigned evidence without reserving', async () => {
    latestRun = { ...latestRun, signature_verified: false };
    expect((await request(app()).post(route).send({ findingIds: [FINDING] })).status).toBe(409);
    latestRun = null;
    expect((await request(app()).post(route).send({ findingIds: [FINDING] })).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects oversized implicit selection rather than silently choosing a subset', async () => {
    candidates = Array.from({ length: 101 }, () => ({ id: FINDING }));
    expect((await request(app()).post(route).send({})).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('maps a competing reservation or stale evidence to conflict', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '40001' } });
    const result = await request(app()).post(route).send({ findingIds: [FINDING] });
    expect(result.status).toBe(409);
  });
  it('rejects a receipt that claims mutation authority', async () => {
    rpc.mockResolvedValue({ data: { mission_id: MISSION, created: true, authority: 'proposal_only', mutation_authorized: true }, error: null });
    expect((await request(app()).post(route).send({ findingIds: [FINDING] })).status).toBe(500);
  });
  it('supplies explicit retry scope after a committed reservation with unavailable readback', async () => {
    readbackMissing = true;
    const result = await request(app()).post(route).send({});
    expect(result.status).toBe(503);
    expect(result.body.retryWithFindingIds).toEqual([FINDING]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects unauthenticated calls before any database access', async () => {
    state.authenticated = false;
    expect((await request(app()).post(route).send({})).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
