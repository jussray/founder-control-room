import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REASONING_STAGE_ORDER,
  cookieBoundaryFingerprint,
} from '../../../reasoningRuns/reasoningRun.js';

const {
  mockFrom,
  mockSelect,
  mockEq,
  mockMaybeSingle,
  mockStoreReasoningRun,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockStoreReasoningRun: vi.fn(),
}));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('../../../services/reasoningRunStore.js', () => ({
  storeReasoningRun: mockStoreReasoningRun,
}));

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (req: Request & { founder?: { email: string; userId: string } }, _res: Response, next: NextFunction) => {
    req.founder = { email: 'founder@example.com', userId: 'founder-1' };
    next();
  },
}));

import { reasoningRunsRouter } from '../reasoningRuns.js';

const SHA = 'a'.repeat(40);

function stages() {
  return REASONING_STAGE_ORDER.map((id) => ({
    id,
    status: 'completed',
    truth: 'verified',
    resultCode: `${id}.complete`,
  }));
}

function body() {
  return {
    chainId: 'founder-workflow-audit',
    occurredAt: '2026-08-16T06:10:00Z',
    source: 'product-design',
    intent: {
      goalCode: 'recursive-founder-workflow-audit',
      targetClass: 'project',
      requestedModes: ['ultrathink', 'redteam', 'ooda', 'l99', 'v10', 'futureyou-me', 'juss'],
    },
    iteration: 1,
    stopReason: 'stable',
    currentHeadSha: SHA,
    nextGateCode: 'semantic-review',
    stages: stages(),
  };
}

function app() {
  const server = express();
  server.use(express.json());
  server.use('/projects', reasoningRunsRouter);
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
  const chain = {
    select: mockSelect,
    eq: mockEq,
    maybeSingle: mockMaybeSingle,
  };
  mockFrom.mockReturnValue(chain);
  mockSelect.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockMaybeSingle.mockResolvedValue({
    data: {
      id: 'project-1',
      slug: 'sekret-bip',
      repo_identifier: 'jussray/Sekret-Bip',
    },
    error: null,
  });
  mockStoreReasoningRun.mockResolvedValue('stored');
});

describe('reasoning run founder ingest', () => {
  it('rejects raw prompt/reasoning/cookie payloads before any project lookup or storage', async () => {
    const response = await request(app())
      .post('/projects/sekret-bip/reasoning-runs')
      .send({
        ...body(),
        nested: {
          ChainOfThought: 'raw internal reasoning must not be persisted',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('RAW_REASONING_DATA_FORBIDDEN');
    expect(response.body.forbiddenKey).toBe('ChainOfThought');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockStoreReasoningRun).not.toHaveBeenCalled();
  });

  it('rejects an explicit raw prompt even when a sanitized operational intent is also supplied', async () => {
    const response = await request(app())
      .post('/projects/sekret-bip/reasoning-runs')
      .send({
        ...body(),
        rawPrompt: 'private founder wording',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('RAW_REASONING_DATA_FORBIDDEN');
    expect(mockStoreReasoningRun).not.toHaveBeenCalled();
  });

  it('stamps project repository, generic founder provenance, and cookie auth boundary instead of trusting body authority', async () => {
    const response = await request(app())
      .post('/projects/sekret-bip/reasoning-runs')
      .send({
        ...body(),
        repository: 'attacker/other-repo',
        source: 'chatgpt',
        auth: {
          transport: 'bearer',
          cookieBoundaryFingerprint: 'f'.repeat(64),
          rawCookieValuesStored: true,
        },
      });

    expect(response.status).toBe(201);
    expect(mockStoreReasoningRun).toHaveBeenCalledTimes(1);
    const stored = mockStoreReasoningRun.mock.calls[0]![1];
    expect(stored.repository).toBe('jussray/Sekret-Bip');
    expect(stored.source).toBe('other');
    expect(stored.intent).toEqual({
      goalCode: 'recursive-founder-workflow-audit',
      targetClass: 'project',
      requestedModes: ['futureyou-me', 'juss', 'l99', 'ooda', 'redteam', 'ultrathink', 'v10'],
    });
    expect(stored.intentFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.auth).toEqual({
      transport: 'founder-session-cookie',
      cookieBoundaryContract: 'fcr/cookie-boundary@v1',
      cookieBoundaryFingerprint: cookieBoundaryFingerprint('founder-session-cookie'),
      rawCookieValuesStored: false,
    });
    expect(response.body.receipt.source).toBe('other');
    expect(response.body.receipt.intentFingerprint).toBe(stored.intentFingerprint);
    expect(response.body.artifact.path).toBe('artifacts/reasoning-runs/founder-workflow-audit-v1.json');
    expect(response.body.artifact.materialized).toBe(false);
    expect(response.body.receipt.privacy.rawPromptFingerprintStored).toBe(false);
    expect(response.body.receipt.privacy.rawChainOfThoughtStored).toBe(false);
  });

  it('derives bearer transport only from the authenticated request header', async () => {
    const response = await request(app())
      .post('/projects/sekret-bip/reasoning-runs')
      .set('Authorization', 'Bearer opaque-test-token')
      .send(body());

    expect(response.status).toBe(201);
    const stored = mockStoreReasoningRun.mock.calls[0]![1];
    expect(stored.source).toBe('other');
    expect(stored.auth.transport).toBe('bearer');
    expect(stored.auth.cookieBoundaryFingerprint).toBe(cookieBoundaryFingerprint('bearer'));
  });

  it('maps a broken self-audit chain to an explicit conflict', async () => {
    mockStoreReasoningRun.mockRejectedValue(new Error('reasoning_run_prior_receipt_mismatch'));

    const response = await request(app())
      .post('/projects/sekret-bip/reasoning-runs')
      .send(body());

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'reasoning self-audit chain is not continuous',
      code: 'REASONING_CHAIN_INVALID',
    });
  });
});
