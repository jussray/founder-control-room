import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import express from 'express';
import request from 'supertest';
import { founderProfilesApiRouter, parseProfile, parseLead, verifyAccessAssertion } from '../founderProfilesApi.js';

function app() {
  const server = express();
  server.use(express.json({ limit: '4kb' }));
  server.use('/api/v1', founderProfilesApiRouter);
  return server;
}
describe('private founder profiles API', () => {
  it('exposes liveness without DB readiness claims', async () => {
    const r = await request(app()).get('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, service: 'founder-profiles-api' });
  });
  it('denies a missing Access assertion even if an API key is presented', async () => {
    vi.stubEnv('FCR_PROFILES_ACCESS_ISSUER', 'https://example.cloudflareaccess.com');
    vi.stubEnv('FCR_PROFILES_ACCESS_AUD', 'audience-id');
    const r = await request(app()).get('/api/v1/founder-profiles').set('x-api-key', 'fcr_prd_' + 'a'.repeat(43));
    expect(r.status).toBe(401);
    vi.unstubAllEnvs();
  });
  it('fails closed when the Access application has not been configured', async () => {
    vi.stubEnv('FCR_PROFILES_ACCESS_ISSUER', '');
    const r = await request(app()).post('/api/v1/leads').send({});
    expect(r.status).toBe(503);
    vi.unstubAllEnvs();
  });
  it('rejects forged JWT shape', async () => {
    await expect(verifyAccessAssertion('a.b.c', {
      FCR_PROFILES_ACCESS_ISSUER: 'https://example.cloudflareaccess.com',
      FCR_PROFILES_ACCESS_AUD: 'audience-id',
    } as NodeJS.ProcessEnv)).rejects.toThrow();
  });
  it('enforces a bounded profile schema, not caller-controlled owner IDs', () => {
    expect(parseProfile({ displayName: 'Founder', headline: 'Build' }))
      .toEqual({ display_name: 'Founder', headline: 'Build' });
    expect(() => parseProfile({ displayName: 'Founder', owner_user_id: 'someone-else' })).toThrow();
    expect(() => parseProfile({ displayName: 'Founder', websiteUrl: 'javascript:bad' })).toThrow();
    expect(() => parseProfile({}, true)).toThrow();
  });
  it('requires consent and rejects unapproved lead fields', () => {
    expect(parseLead({ name: 'One', email: 'A@example.com', interest: 'Demo', consent: true }))
      .toMatchObject({ email: 'a@example.com' });
    expect(() => parseLead({ name: 'One', email: 'a@example.com', interest: 'Demo', consent: false })).toThrow();
    expect(() => parseLead({ name: 'One', email: 'a@example.com', interest: 'Demo', consent: true, privateNotes: 'secret' })).toThrow();
  });
});
