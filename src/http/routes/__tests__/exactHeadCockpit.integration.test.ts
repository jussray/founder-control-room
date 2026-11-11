import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const head = 'b'.repeat(40);
  const base = 'a'.repeat(40);
  const context = {
    number: 832,
    repository: 'jussray/founder-control-room',
    headRepository: 'jussray/founder-control-room',
    baseRef: 'main',
    headRef: 'fix/five-screen-shell-ia',
    baseSha: base,
    headSha: head,
    authorIdentity: 'founder',
    state: 'open' as const,
    draft: true,
    merged: false,
  };
  const provider = {
    observePullRequest: vi.fn(),
    resolveRef: vi.fn(),
    listVerificationSignals: vi.fn(),
    listReviewSignals: vi.fn(),
    compare: vi.fn(),
  };
  return { context, provider, providerForProject: vi.fn(), providerConfigurationError: vi.fn() };
});

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.get('x-fixture-founder') === 'yes') return next();
    return res.status(401).json({ error: 'Founder session required' });
  },
}));
vi.mock('../../../providers/providerFactory.js', () => ({
  providerForProject: fixtures.providerForProject,
  providerConfigurationError: fixtures.providerConfigurationError,
}));

import { exactHeadCockpitRouter } from '../exactHeadCockpit.js';

function app() {
  const server = express();
  server.use('/integration-cockpit', exactHeadCockpitRouter);
  return server;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.providerForProject.mockReturnValue(fixtures.provider);
  fixtures.providerConfigurationError.mockReturnValue(null);
  fixtures.provider.observePullRequest.mockResolvedValue(fixtures.context);
  fixtures.provider.resolveRef.mockResolvedValue(fixtures.context.baseSha);
  fixtures.provider.listVerificationSignals.mockResolvedValue([
    { id:'11', name:'Required Gate', status:'passed', commitSha:fixtures.context.headSha, provider:'github' },
    { id:'12', name:'Optional build', status:'skipped', commitSha:fixtures.context.headSha, provider:'github' },
  ]);
  fixtures.provider.listReviewSignals.mockResolvedValue([]);
  fixtures.provider.compare.mockResolvedValue({ aheadBy:5, behindBy:979, files:[] });
});

describe('exact-head cockpit founder read boundary', () => {
  it('withholds the project registry and PR evidence without a founder session', async () => {
    const a = app();
    expect((await request(a).get('/integration-cockpit/projects')).status).toBe(401);
    expect((await request(a).get('/integration-cockpit/inspect/fcr/832')).status).toBe(401);
    expect(fixtures.providerForProject).not.toHaveBeenCalled();
  });

  it('includes drafts in diagnosis but never grants merge or release authority', async () => {
    const response = await request(app()).get('/integration-cockpit/inspect/fcr/832').set('x-fixture-founder','yes');
    expect(response.status).toBe(200);
    expect(response.body.pr).toMatchObject({ draft:true,state:'open' });
    expect(response.body.exact.headSha).toBe(fixtures.context.headSha);
    expect(response.body.live).toMatchObject({headMatches:true,baseMatches:true});
    expect(response.body.gate).toMatchObject({merge:false,deploy:false,requiredChecksVerified:false,observedChecksPassed:false});
    expect(response.body.blockers).toContain('PR is draft and not review eligible');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-robots-tag']).toContain('noindex');
    expect(fixtures.provider.observePullRequest).toHaveBeenCalledTimes(2);
    expect(fixtures.providerForProject).toHaveBeenCalledTimes(1);
  });

  it('treats a moving PR head as stale instead of authorizing any action', async () => {
    fixtures.provider.observePullRequest.mockResolvedValueOnce(fixtures.context)
      .mockResolvedValueOnce({...fixtures.context,headSha:'c'.repeat(40)});
    const response=await request(app()).get('/integration-cockpit/inspect/fcr/832').set('x-fixture-founder','yes');
    expect(response.status).toBe(200);
    expect(response.body.live.headMatches).toBe(false);
    expect(response.body.evidenceStatus).toBe('stale_or_unknown');
    expect(response.body.blockers).toContain('Current PR head could not be confirmed');
    expect(response.body.gate.merge).toBe(false);
  });

  it('fails closed without provider metadata, and does not echo secret errors', async () => {
    fixtures.provider.observePullRequest.mockRejectedValue(new Error('secret test-only token'));
    const response=await request(app()).get('/integration-cockpit/inspect/fcr/832').set('x-fixture-founder','yes');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('PR_OBSERVATION_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('rejects unresolved repositories and invalid PR numbers', async () => {
    const a=app();
    expect((await request(a).get('/integration-cockpit/inspect/games/2').set('x-fixture-founder','yes')).status).toBe(404);
    expect((await request(a).get('/integration-cockpit/inspect/fcr/0').set('x-fixture-founder','yes')).status).toBe(400);
    expect(fixtures.providerForProject).not.toHaveBeenCalled();
  });

  it('bounds authenticated catalog reads with an independent route-local 429', async () => {
    const instance = app();
    let limited = null;
    for (let attempt = 0; attempt < 70; attempt += 1) {
      const response = await request(instance).get('/integration-cockpit/projects').set('x-fixture-founder','yes');
      if (response.status === 429) {
        limited = response;
        break;
      }
      expect(response.status).toBe(200);
    }
    if (!limited) throw new Error('Cockpit route-local limiter failed to return 429');
    expect(limited.body).toMatchObject({code:'COCKPIT_RATE_LIMITED',blocked:true});
    expect(limited.headers['retry-after']).toBeDefined();
    expect(fixtures.providerForProject).not.toHaveBeenCalled();
  });
});
