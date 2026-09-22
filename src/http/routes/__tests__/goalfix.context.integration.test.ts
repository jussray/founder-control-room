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

const PROJECTS = [
  {
    id: 'bip-project',
    slug: 'sekret-bip',
    name: "Se'kret Bip",
    repo_provider: 'github',
    repo_identifier: 'jussray/Sekret-Bip',
  },
  {
    id: 'jbh-public',
    slug: 'juss-beautiful-hair',
    name: 'Juss Beautiful Hair',
    repo_provider: 'github',
    repo_identifier: 'jussray/jussbeautifulhair-site',
  },
  {
    id: 'jbh-private',
    slug: 'juss-beautiful-hair-private',
    name: 'Juss Beautiful Hair — Private Control',
    repo_provider: 'github',
    repo_identifier: 'jussray/jbh-private',
  },
  {
    id: 'fcr-project',
    slug: 'founder-control-room',
    name: 'Founder Control Room',
    repo_provider: 'github',
    repo_identifier: 'jussray/founder-control-room',
  },
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

function projectListRow(projects = PROJECTS) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => Promise.resolve({ data: projects, error: null }),
      }),
    }),
  };
}

function founderSession() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function manifest(repository: string) {
  return JSON.stringify({
    repository,
    tests: {
      workflowCatalog: [
        { id: 'truth', name: 'Repository Truth Gate', kind: 'contract', required: true, status: 'active' },
        { id: 'browser', name: 'Product Design Playwright Proof', kind: 'e2e', required: true, status: 'active' },
      ],
    },
  });
}

function installSupabaseProjects(projects = PROJECTS) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'projects') return projectListRow(projects);
    if (table === 'project_events') return { insert: auditInsertMock };
    return {};
  });
}

function automaticPayload(project = 'Bip') {
  return {
    project,
    desiredOutcome: 'Keep the public welcome available before login.',
    constraints: ['Do not weaken protected route guards.'],
    firstFilesOrLogs: ['app/_layout.tsx'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  founderSession();
  installSupabaseProjects();
  providerForProjectMock.mockReturnValue(providerMock);
  providerMock.getProject.mockImplementation(async (projectId: string) => {
    const row = PROJECTS.find((project) => project.slug === projectId)!;
    return {
      projectId,
      name: row.repo_identifier.split('/')[1],
      provider: 'github',
      defaultBranch: 'main',
      locator: row.repo_identifier,
      isActive: true,
    };
  });
  providerMock.getRef.mockImplementation(async (_projectId: string, ref: string) => ({ name: ref, commitSha: SHA }));
  providerMock.readFile.mockImplementation(async (projectId: string, ref: string, path: string) => {
    expect(ref).toBe(SHA);
    expect(path).toBe('control-room.manifest.json');
    const row = PROJECTS.find((project) => project.slug === projectId)!;
    return manifest(row.repo_identifier);
  });
  providerMock.listVerificationSignals.mockResolvedValue([
    { id: 'truth', name: 'Repository Truth Gate', status: 'passed', commitSha: SHA, provider: 'github' },
    { id: 'browser', name: 'Product Design Playwright Proof', status: 'passed', commitSha: SHA, provider: 'github' },
  ]);
  auditInsertMock.mockResolvedValue({ error: null });
});

describe('POST /goalfix/inspect automatic context', () => {
  it('compiles founder shorthand into registry, provider, exact-head, and manifest context', async () => {
    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(automaticPayload());

    expect(response.status).toBe(200);
    expect(providerForProjectMock).toHaveBeenCalledWith({
      repo_provider: 'github',
      slug: 'sekret-bip',
      repo_identifier: 'jussray/Sekret-Bip',
    });
    expect(providerMock.getProject).toHaveBeenCalledWith('sekret-bip');
    expect(providerMock.getRef).toHaveBeenCalledWith('sekret-bip', 'main');
    expect(providerMock.readFile).toHaveBeenCalledWith('sekret-bip', SHA, 'control-room.manifest.json');
    expect(providerMock.listVerificationSignals).toHaveBeenCalledWith('sekret-bip', SHA);
    expect(response.body).toMatchObject({
      project: { slug: 'sekret-bip', repository: 'jussray/Sekret-Bip' },
      target: { name: 'main', commitSha: SHA },
      goal: {
        desiredOutcome: 'Keep the public welcome available before login.',
        expectedVerificationNames: ['Repository Truth Gate', 'Product Design Playwright Proof'],
      },
      skillRuntime: {
        intent: { confirmed: true, confidence: 'high' },
        mayProceed: true,
      },
      contextResolution: {
        mode: 'automatic',
        requestedProject: 'Bip',
        resolvedProjectSlug: 'sekret-bip',
        repository: 'jussray/Sekret-Bip',
        defaultBranch: 'main',
        requestedRef: null,
        resolvedRef: 'main',
        requiredVerificationNames: ['Repository Truth Gate', 'Product Design Playwright Proof'],
      },
    });
    expect(response.body.skillRuntime.scope.stopCondition).toContain('Stop before mutation');
  });

  it('uses the provider-reported default branch when the founder does not provide a ref', async () => {
    providerMock.getProject.mockResolvedValueOnce({
      projectId: 'sekret-bip',
      name: 'Sekret-Bip',
      provider: 'github',
      defaultBranch: 'trunk',
      locator: 'jussray/Sekret-Bip',
      isActive: true,
    });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(automaticPayload());

    expect(response.status).toBe(200);
    expect(providerMock.getRef).toHaveBeenCalledWith('sekret-bip', 'trunk');
    expect(response.body.contextResolution.defaultBranch).toBe('trunk');
    expect(response.body.contextResolution.resolvedRef).toBe('trunk');
  });

  it('resolves JBH to the registered public storefront without collapsing the private-control repository', async () => {
    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(automaticPayload('JBH'));

    expect(response.status).toBe(200);
    expect(providerForProjectMock).toHaveBeenCalledWith({
      repo_provider: 'github',
      slug: 'juss-beautiful-hair',
      repo_identifier: 'jussray/jussbeautifulhair-site',
    });
    expect(response.body.contextResolution.repository).toBe('jussray/jussbeautifulhair-site');
  });

  it('fails closed before provider access when project shorthand is ambiguous', async () => {
    installSupabaseProjects([
      ...PROJECTS,
      {
        id: 'other-bip',
        slug: 'other-bip',
        name: 'Another Bip',
        repo_provider: 'github',
        repo_identifier: 'jussray/other-bip',
      },
    ]);

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(automaticPayload('Bip'));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PROJECT_CONTEXT_AMBIGUOUS');
    expect(response.body.candidates).toHaveLength(2);
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });

  it('fails closed when the live provider repository identity disagrees with the registry', async () => {
    providerMock.getProject.mockResolvedValueOnce({
      projectId: 'sekret-bip',
      name: 'wrong-repo',
      provider: 'github',
      defaultBranch: 'main',
      locator: 'jussray/wrong-repo',
      isActive: true,
    });

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(automaticPayload());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GOALFIX_REPOSITORY_IDENTITY_MISMATCH');
    expect(providerMock.getRef).not.toHaveBeenCalled();
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the exact-head manifest claims a different repository', async () => {
    providerMock.readFile.mockResolvedValueOnce(manifest('jussray/wrong-repo'));

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send(automaticPayload());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GOALFIX_REPOSITORY_IDENTITY_MISMATCH');
    expect(providerMock.listVerificationSignals).not.toHaveBeenCalled();
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
  });

  it('treats caller-supplied checks as additive rather than a way to weaken manifest proof', async () => {
    providerMock.listVerificationSignals.mockResolvedValueOnce([
      { id: 'truth', name: 'Repository Truth Gate', status: 'passed', commitSha: SHA, provider: 'github' },
      { id: 'browser', name: 'Product Design Playwright Proof', status: 'passed', commitSha: SHA, provider: 'github' },
      { id: 'extra', name: 'Founder Requested Extra', status: 'passed', commitSha: SHA, provider: 'github' },
    ]);

    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({ ...automaticPayload(), expectedVerificationNames: ['Founder Requested Extra'] });

    expect(response.status).toBe(200);
    expect(response.body.goal.expectedVerificationNames).toEqual([
      'Repository Truth Gate',
      'Product Design Playwright Proof',
      'Founder Requested Extra',
    ]);
  });

  it('does not auto-confirm a shorthand intent interpretation that carries assumptions', async () => {
    const response = await request(buildApp())
      .post('/goalfix/inspect')
      .set('Authorization', BEARER)
      .send({
        ...automaticPayload(),
        desiredOutcome: 'cont the skill thing',
        intentAssumptions: ['The referenced skill is GoalFix.'],
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GOALFIX_RUNTIME_BLOCKED');
    expect(response.body.skillRuntime.intent).toMatchObject({ confidence: 'low', confirmed: false });
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });
});
