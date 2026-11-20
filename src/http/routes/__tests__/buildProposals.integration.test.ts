import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));
vi.mock('../../../lib/supabaseAuthClient.js', () => ({ supabaseAuth: { auth: { getUser: mockGetUser } } }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { createBuildProposalRouter, safeBuildProposalPath } from '../buildProposals.js';

const SHA = 'a'.repeat(40);
const project = { id: 'project-1', slug: 'founder-control-room', repo_provider: 'github', repo_identifier: 'jussray/founder-control-room' };
const valid = { projectSlug: project.slug, ref: 'mission/test-branch', path: 'src/example.ts', goal: 'Change ready to true without changing other behavior.' };

function authenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'founder@example.com', email_confirmed_at: '2026-11-20T00:00:00Z' } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== 'founder_users') return {};
    const query = { eq: () => query, maybeSingle: () => Promise.resolve({ data: { user_id: 'u1' }, error: null }) };
    return { select: () => query };
  });
}

function build(options: { source?: string; result?: string; head?: string } = {}) {
  const source = options.source ?? 'export const ready = false;\n';
  const getRef = vi.fn(async () => options.head ?? SHA);
  const reader = {
    resolveRef: getRef,
    readFile: vi.fn(async () => source),
  };
  const propose = vi.fn(async () => ({
    content: options.result ?? 'export const ready = true;\n',
    summary: 'Update the one ready boolean.',
    provider: 'openai', model: 'test-model', responseId: 'test-response',
  }));
  const recordAudit = vi.fn(async (_id: string, _metadata: Record<string, unknown>) => undefined);
  const app = express();
  app.use(express.json());
  app.use('/prompt-workflows', createBuildProposalRouter({
    lookupProject: async () => project,
    repository: () => reader,
    propose,
    recordAudit,
  }));
  return { app, getRef, reader, propose, recordAudit };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('first-party AI build proposal seam', () => {
  it('only accepts eligible single-file repository source paths', () => {
    expect(safeBuildProposalPath('src/example.ts')).toBe(true);
    expect(safeBuildProposalPath('docs/FOUNDER_GITHUB_WORKSPACE.md')).toBe(true);
    // AI proposals must fit the existing exact-source mission receipt validator.
    expect(safeBuildProposalPath('public/control-room/app.js')).toBe(false);
    for (const bad of ['src/../.env', '.github/workflows/a.yml', 'src/secrets/token.ts', 'src/private-keys/key.ts', '/src/app.ts', 'src//a.ts', 'src/a.pem', 'src/a.png', 'app/page.tsx', 'src/./a.ts']) {
      expect(safeBuildProposalPath(bad)).toBe(false);
    }
  });

  it('rejects anonymous requests before repository or model access', async () => {
    const fixture = build();
    const response = await request(fixture.app).post('/prompt-workflows/propose').send(valid);
    expect(response.status).toBe(401);
    expect(fixture.getRef).not.toHaveBeenCalled();
    expect(fixture.propose).not.toHaveBeenCalled();
  });

  it('rejects protected base refs without calling a paid model', async () => {
    authenticated();
    for (const ref of ['main', 'master', 'refs/heads/main']) {
      const fixture = build();
      const response = await request(fixture.app).post('/prompt-workflows/propose')
        .set('Authorization', 'Bearer test-token')
        .send({ ...valid, ref });
      expect(response.status).toBe(400);
      expect(fixture.reader.readFile).not.toHaveBeenCalled();
      expect(fixture.propose).not.toHaveBeenCalled();
    }
  });

  it('rejects source paths that cannot pass the existing staged mission validator', async () => {
    authenticated();
    const fixture = build();
    const response = await request(fixture.app).post('/prompt-workflows/propose')
      .set('Authorization', 'Bearer test-token')
      .send({ ...valid, path: 'public/control-room/app.js' });
    expect(response.status).toBe(400);
    expect(fixture.reader.readFile).not.toHaveBeenCalled();
    expect(fixture.propose).not.toHaveBeenCalled();
  });

  it('rejects invalid file paths and goals before a provider read', async () => {
    authenticated();
    const fixture = build();
    const response = await request(fixture.app).post('/prompt-workflows/propose')
      .set('Authorization', 'Bearer test-token')
      .send({ ...valid, path: 'src/../.env', goal: 'do it' });
    expect(response.status).toBe(400);
    expect(fixture.reader.readFile).not.toHaveBeenCalled();
  });

  it('rejects credential-bearing founder goals before reading repository source', async () => {
    authenticated();
    const fixture = build();
    const response = await request(fixture.app).post('/prompt-workflows/propose')
      .set('Authorization', 'Bearer test-token')
      .send({ ...valid, goal: 'Change ready; secret: -----BEGIN PRIVATE KEY----- do not share.' });
    expect(response.status).toBe(400);
    expect(fixture.reader.readFile).not.toHaveBeenCalled();
    expect(fixture.propose).not.toHaveBeenCalled();
  });

  it('returns a bounded, fingerprinted review-only proposal without any write authority', async () => {
    authenticated();
    const fixture = build();
    const response = await request(fixture.app).post('/prompt-workflows/propose')
      .set('Authorization', 'Bearer test-token')
      .send(valid);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      contract: 'fcr/first-party-build-proposal@v1',
      status: 'proposal_only',
      proposal: { path: valid.path, ref: valid.ref, exactSha: SHA, content: 'export const ready = true;\n' },
      provenance: { provider: 'openai', sourceVerified: true, sourceRechecked: true, testsRun: false, browserProof: false },
      authority: { repositoryWrite: false, merge: false, deploy: false, release: false, spend: false, reviewRequired: true },
    });
    expect(response.body.proposal.beforeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(response.body.proposal.afterSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fixture.reader.readFile).toHaveBeenCalledWith(project.slug, SHA, valid.path);
    expect(fixture.getRef).toHaveBeenCalledTimes(2);
    expect(fixture.recordAudit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fixture.recordAudit.mock.calls[0])).not.toContain('export const ready');
    expect(JSON.stringify(fixture.recordAudit.mock.calls[0])).not.toContain(valid.goal);
  });

  it('fails closed if the ref moved while the model generated source', async () => {
    authenticated();
    const fixture = build();
    fixture.getRef.mockResolvedValueOnce(SHA).mockResolvedValueOnce('b'.repeat(40));
    const response = await request(fixture.app).post('/prompt-workflows/propose')
      .set('Authorization', 'Bearer test-token').send(valid);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SOURCE_MOVED');
    expect(fixture.recordAudit).not.toHaveBeenCalled();
    expect(response.body.proposal).toBeUndefined();
  });

  it('blocks secret-bearing source before any external model call', async () => {
    authenticated();
    const fixture = build({ source: '-----BEGIN PRIVATE KEY-----\nprivate\n' });
    const response = await request(fixture.app).post('/prompt-workflows/propose')
      .set('Authorization', 'Bearer test-token').send(valid);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('SOURCE_NOT_ELIGIBLE');
    expect(fixture.propose).not.toHaveBeenCalled();
  });

  it('rejects unsafe model output and unchanged output', async () => {
    authenticated();
    for (const candidate of ['-----BEGIN PRIVATE KEY-----\n...', 'export const ready = false;\n']) {
      const fixture = build({ result: candidate });
      const response = await request(fixture.app).post('/prompt-workflows/propose')
        .set('Authorization', 'Bearer test-token').send(valid);
      expect(response.status).toBe(422);
      expect(response.body.proposal).toBeUndefined();
      expect(fixture.recordAudit).not.toHaveBeenCalled();
    }
  });

  it('does not release an AI proposal if the audit write fails', async () => {
    authenticated();
    const fixture = build();
    fixture.recordAudit.mockRejectedValue(new Error('database unavailable'));
    const response = await request(fixture.app).post('/prompt-workflows/propose')
      .set('Authorization', 'Bearer test-token').send(valid);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('PROPOSAL_AUDIT_UNAVAILABLE');
    expect(response.body.proposal).toBeUndefined();
  });
});
