import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFounderSession } = vi.hoisted(() => ({
  mockReadFounderSession: vi.fn(),
}));

vi.mock('../../../auth/founderSession.js', () => ({
  readFounderSession: mockReadFounderSession,
}));

vi.mock('../../middleware/requireFounder.js', () => ({
  requireInteractiveFounder: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { founder?: { email: string; userId: string } }).founder = {
      email: 'founder@example.com',
      userId: 'founder-user-1',
    };
    next();
  },
}));

import { oauthConsentRouter } from '../oauthConsent.js';

const AUTHORIZATION_ID = 'auth_request_12345678';
const SUPABASE_URL = 'https://oojzfmmywbvficgybaxd.supabase.co';

function app() {
  const value = express();
  value.use(express.json());
  value.use('/auth/oauth', oauthConsentRouter);
  return value;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OAuth consent proxy', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
    process.env.FCR_OAUTH_CONSENT_ENABLED = 'true';
    process.env.FCR_OAUTH_CONSENT_CLIENT_IDS = 'chatgpt-client';
    delete process.env.SUPABASE_ANON_KEY;
    mockReadFounderSession.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FCR_OAUTH_CONSENT_ENABLED;
    delete process.env.FCR_OAUTH_CONSENT_CLIENT_IDS;
  });

  it('requires the server-held interactive founder session before proxying consent', async () => {
    mockReadFounderSession.mockResolvedValueOnce(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app())
      .get(`/auth/oauth/authorizations/${AUTHORIZATION_ID}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Interactive founder session required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads authorization details from Supabase without returning founder credentials', async () => {
    mockReadFounderSession.mockResolvedValueOnce({
      accessToken: 'founder-access-token',
      refreshToken: 'founder-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi.fn(async () => jsonResponse({
      authorization_id: AUTHORIZATION_ID,
      client: { id: 'chatgpt-client', name: 'ChatGPT' },
      user: { email: 'founder@example.com' },
      redirect_uri: 'https://chatgpt.com/aip/callback',
      scope: 'email',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app())
      .get(`/auth/oauth/authorizations/${AUTHORIZATION_ID}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      authorization_id: AUTHORIZATION_ID,
      client: { id: 'chatgpt-client' },
      scope: 'email',
    });
    expect(JSON.stringify(response.body)).not.toContain('founder-access-token');
    expect(JSON.stringify(response.body)).not.toContain('founder-refresh-token');
    expect(fetchMock).toHaveBeenCalledWith(
      `${SUPABASE_URL}/auth/v1/oauth/authorizations/${AUTHORIZATION_ID}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer founder-access-token',
          apikey: 'sb_publishable_test_key',
        }),
      }),
    );
  });

  it('forwards only an explicit approve or deny decision to the current authorization', async () => {
    mockReadFounderSession.mockResolvedValueOnce({
      accessToken: 'founder-access-token',
      refreshToken: 'founder-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authorization_id: AUTHORIZATION_ID, client: { id: 'chatgpt-client', name: 'ChatGPT' }, redirect_uri: 'https://chatgpt.com/aip/callback', scope: 'email' }))
      .mockResolvedValueOnce(jsonResponse({ redirect_url: 'https://chatgpt.com/aip/callback?code=test' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app())
      .post(`/auth/oauth/authorizations/${AUTHORIZATION_ID}/consent`)
      .send({ action: 'approve', extra: 'ignored' });

    expect(response.status).toBe(200);
    expect(response.body.redirect_url).toContain('https://chatgpt.com/');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      `${SUPABASE_URL}/auth/v1/oauth/authorizations/${AUTHORIZATION_ID}/consent`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'approve' }),
      }),
    );
  });

  it('rejects malformed authorization ids and unsupported decisions before provider dispatch', async () => {
    mockReadFounderSession.mockResolvedValue({
      accessToken: 'founder-access-token',
      refreshToken: 'founder-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const malformed = await request(app()).get('/auth/oauth/authorizations/no');
    const wrongAction = await request(app())
      .post(`/auth/oauth/authorizations/${AUTHORIZATION_ID}/consent`)
      .send({ action: 'publish' });

    expect(malformed.status).toBe(400);
    expect(wrongAction.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails closed before Supabase calls when the client allowlist is absent', async () => {
    mockReadFounderSession.mockResolvedValue({ accessToken:'synthetic',refreshToken:'synthetic' });
    delete process.env.FCR_OAUTH_CONSENT_CLIENT_IDS;
    const fetchMock=vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response=await request(app()).get('/auth/oauth/authorizations/'+AUTHORIZATION_ID);
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not trust a registered but unapproved OAuth client', async () => {
    mockReadFounderSession.mockResolvedValue({ accessToken:'synthetic',refreshToken:'synthetic' });
    const fetchMock=vi.fn(async()=>jsonResponse({
      authorization_id:AUTHORIZATION_ID,
      client:{id:'unapproved-client',name:'Unexpected Client'},
      redirect_uri:'https://unknown.example/callback',
      scope:'email',
    }));
    vi.stubGlobal('fetch',fetchMock);
    const read=await request(app()).get('/auth/oauth/authorizations/'+AUTHORIZATION_ID);
    const decision=await request(app()).post('/auth/oauth/authorizations/'+AUTHORIZATION_ID+'/consent').send({action:'approve'});
    expect(read.status).toBe(403);
    expect(decision.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(call => !String((call as unknown[])[0]).endsWith('/consent'))).toBe(true);
  });

  it('rejects authorization substitution before forwarding an approval', async()=>{
    mockReadFounderSession.mockResolvedValue({accessToken:'synthetic',refreshToken:'synthetic'});
    const fetchMock=vi.fn(async()=>jsonResponse({
      authorization_id:'different_request',
      client:{id:'chatgpt-client',name:'ChatGPT'},
      redirect_uri:'https://chatgpt.com/aip/callback',
    }));
    vi.stubGlobal('fetch',fetchMock);
    const response=await request(app()).post('/auth/oauth/authorizations/'+AUTHORIZATION_ID+'/consent').send({action:'approve'});
    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects consent when the runtime enable flag is absent',async()=>{
    mockReadFounderSession.mockResolvedValue({accessToken:'synthetic',refreshToken:'synthetic'});
    delete process.env.FCR_OAUTH_CONSENT_ENABLED;
    const fetchMock=vi.fn();
    vi.stubGlobal('fetch',fetchMock);
    const response=await request(app()).post('/auth/oauth/authorizations/'+AUTHORIZATION_ID+'/consent').send({action:'approve'});
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
