import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, from, observeInstallation } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  observeInstallation: vi.fn(),
}));
vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { from } }));
vi.mock('../../../providers/githubAppAuth.js', () => ({
  observeGitHubRepositoryInstallation: observeInstallation,
}));

import express from 'express';
import request from 'supertest';
import { pluginCenterRouter } from '../pluginCenter.js';

function app() {
  const server = express();
  server.use('/plugin-center', pluginCenterRouter);
  return server;
}
const url = '/plugin-center/github-installation';
function founder() {
  getUser.mockResolvedValue({
    data: { user: { id: 'founder-test-id', email: 'founder@example.com' } }, error: null,
  });
  from.mockImplementation((table: string) => {
    if (table !== 'founder_users') throw new Error('Unexpected table: ' + table);
    return { select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: { email: 'founder@example.com' }, error: null }),
    }) }) };
  });
}
const evidence = {
  repository: 'jussray/founder-control-room',
  appId: '900001',
  installationId: '42',
  repositorySelection: 'selected',
  suspendedAt: null,
  permissions: { contents: 'read', checks: 'write' },
};

describe('GitHub App installation / MCP handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GITHUB_APP_ID', '900001');
    vi.stubEnv('GITHUB_PRIVATE_KEY', 'test-only-non-secret-placeholder');
    observeInstallation.mockResolvedValue(evidence);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires a founder identity before exposing installation readback', async () => {
    const response = await request(app()).get(url + '?installation_id=42');
    expect(response.status).toBe(401);
    expect(observeInstallation).not.toHaveBeenCalled();
  });

  it('verifies exact installation and never grants MCP or merge authority', async () => {
    founder();
    const response = await request(app())
      .get(url + '?installation_id=42').set('Authorization', 'Bearer test-only-founder');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(observeInstallation).toHaveBeenCalledWith(
      '900001', 'test-only-non-secret-placeholder', 'jussray/founder-control-room',
    );
    expect(response.body).toMatchObject({
      verified: true,
      installation: evidence,
      mcp: { endpoint: 'https://api.foundercontrolroom.org/mcp', auth: 'separate_oauth' },
      authorizesMcpAccess: false,
      authorizesMerge: false,
    });
    expect(JSON.stringify(response.body)).not.toContain('test-only-non-secret-placeholder');
  });

  it('rejects an untrusted installation ID rather than assuming it is authority', async () => {
    founder();
    const response = await request(app())
      .get(url + '?installation_id=999').set('Authorization', 'Bearer test-only-founder');
    expect(response.status).toBe(409);
    expect(response.body.verified).not.toBe(true);
  });

  it('rejects malformed installation identifiers before a GitHub request', async () => {
    founder();
    const response = await request(app())
      .get(url + '?installation_id=nope').set('Authorization', 'Bearer test-only-founder');
    expect(response.status).toBe(400);
    expect(observeInstallation).not.toHaveBeenCalled();
  });

  it('returns unverified when App credentials or GitHub readback are missing', async () => {
    founder();
    vi.stubEnv('GITHUB_PRIVATE_KEY', '');
    const missing = await request(app())
      .get(url + '?installation_id=42').set('Authorization', 'Bearer test-only-founder');
    expect(missing.status).toBe(503);
    expect(observeInstallation).not.toHaveBeenCalled();

    vi.stubEnv('GITHUB_PRIVATE_KEY', 'test-only-non-secret-placeholder');
    observeInstallation.mockRejectedValue(new Error('provider test failure'));
    const unavailable = await request(app())
      .get(url + '?installation_id=42').set('Authorization', 'Bearer test-only-founder');
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(unavailable.body)).not.toContain('provider test failure');
  });

  it('keeps a suspended or unknown installation unverified', async () => {
    founder();
    observeInstallation.mockResolvedValueOnce({
      ...evidence, suspendedAt: '2026-10-16T11:00:00Z',
    });
    const suspended = await request(app())
      .get(url + '?installation_id=42').set('Authorization', 'Bearer test-only-founder');
    expect(suspended.status).toBe(409);
    expect(suspended.body.verified).not.toBe(true);

    observeInstallation.mockResolvedValueOnce({
      ...evidence, suspendedAt: undefined,
    });
    const unknown = await request(app())
      .get(url + '?installation_id=42').set('Authorization', 'Bearer test-only-founder');
    expect(unknown.status).toBe(409);
    expect(unknown.body.verified).not.toBe(true);
  });
});
