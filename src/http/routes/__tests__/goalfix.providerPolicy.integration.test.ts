import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, providerMock, providerForProjectMock, auditInsertMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  providerMock: {
    getProject: vi.fn(),
    getRef: vi.fn(),
    readFile: vi.fn(),
    listVerificationSignals: vi.fn(),
  },
  providerForProjectMock: vi.fn(),
  auditInsertMock: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../providers/providerFactory.js', () => ({
  providerForProject: providerForProjectMock,
}));

import express from 'express';
import request from 'supertest';
import { goalfixRouter } from '../goalfix.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const SHA = 'abc123abc123abc123abc123abc123abc123abcd';
const PROJECT = {
  id: 'chief-project',
  slug: 'chief-ai-machine',
  name: 'Chief AI Machine',
  repo_provider: 'github',
  repo_identifier: 'jussray/chief-ai-machine',
};
const REQUIRED_CHECKS = [
  'Typecheck',
  'Lint',
  'Unit Tests',
  'Verify Chief AI control room contracts',
  'Verify operational authority',
  'Verify test-ledger contract',
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/goalfix', goalfixRouter);
  return app;
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function projectListRow() {
  return {
    select: () => ({
      eq: () => ({
        eq: () => Promise.resolve({ data: [PROJECT], error: null }),
      }),
    }),
  };
}

function catalogManifest() {
  return JSON.stringify({
    repository: PROJECT.repo_identifier,
    tests: {
      catalog: [
        { id: 'typecheck', name: 'Chief AI TypeScript', required: true, status: 'active' },
        { id: 'unit-tests', name: 'Chief AI unit tests', required: true, status: 'active' },
        { id: 'playwright', name: 'Freestyle save and persistence Chromium proof', required: true, status: 'active' },
      ],
    },
  });
}

function providerPolicy() {
  return JSON.stringify({
    repository: PROJECT.repo_identifier,
    source: { provider: 'github-check-runs', exactRef: 'commit-sha' },
    policy: {
      requiredCheckAuthority: 'repository-policy',
      requiredChecks: REQUIRED_CHECKS,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'projects') return projectListRow();
    if (table === 'project_events') return { insert: auditInsertMock };
    return {};
  });
  auditInsertMock.mockResolvedValue({ error: null });
  providerForProjectMock.mockReturnValue(providerMock);
  providerMock.getProject.mockResolvedValue({
    projectId: PROJECT.slug,
    name: 'chief-ai-machine',
    provider: 'github',
    defaultBranch: 'main',
    locator: PROJECT.repo_identifier,
    isActive: true,
  });
  providerMock.getRef.mockResolvedValue({ name: 'main', commitSha: SHA });
  providerMock.readFile.mockImplementation(async (_projectId: string, ref: string, path: string) => {
    expect(ref).toBe(SHA);
    if (path === 'control-room.manifest.json') return catalogManifest();
    if (path === '.control-room/test-ledger.manifest.json') return providerPolicy();
    throw new Error(`Unexpected file read: ${path}`);
  });
  providerMock.listVerificationSignals.mockResolvedValue(
    REQUIRED_CHECKS.map((name, index) => ({
      id: `required-${index}`,
      name,
      status: 'passed',
      commitSha: SHA,
      provider: 'github',
    })),
  );
});

describe('POST /goalfix/inspect provider policy resolution', () => {
  it('uses exact-head ledger requiredChecks instead of catalog display labels', async () => {
    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({
        project: 'Chief AI Machine',
        desiredOutcome: 'Inspect the exact provider proof without guessing check names.',
        constraints: ['Read-only inspection'],
        firstFilesOrLogs: ['control-room.manifest.json'],
      });

    expect(response.status).toBe(200);
    expect(providerMock.readFile).toHaveBeenNthCalledWith(
      1,
      PROJECT.slug,
      SHA,
      'control-room.manifest.json',
    );
    expect(providerMock.readFile).toHaveBeenNthCalledWith(
      2,
      PROJECT.slug,
      SHA,
      '.control-room/test-ledger.manifest.json',
    );
    expect(response.body.goal.expectedVerificationNames).toEqual(REQUIRED_CHECKS);
    expect(response.body.goal.expectedVerificationNames).not.toContain('Chief AI TypeScript');
    expect(response.body.contextResolution.requiredVerificationNames).toEqual(REQUIRED_CHECKS);
    expect(response.body.readiness).not.toBe('blocked');
  });
});
