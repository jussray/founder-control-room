import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { onboardingRouter } from '../onboarding.js';

function app() {
  const application = express();
  application.use('/', onboardingRouter);
  return application;
}

describe('API-hosted consent UI', () => {
  it('serves a no-store consent screen with same-origin assets and protective CSP', async () => {
    const response = await request(app()).get('/oauth/consent?authorization_id=consent_request_123456');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.text).toContain('Approve connection');
    expect(response.text).toContain('Deny');
    expect(response.text).toContain('/assets/oauth-consent.js');
    expect(response.text).toContain('/assets/oauth-consent.css');
    expect(response.text).toContain('href="/" id="sign-in-link"');
    expect(response.text).not.toContain('access_token');
  });

  it('serves consent logic and CSS with no-store and host-relative API calls', async () => {
    const [script, css] = await Promise.all([
      request(app()).get('/assets/oauth-consent.js'),
      request(app()).get('/assets/oauth-consent.css'),
    ]);
    expect(script.status).toBe(200);
    expect(css.status).toBe(200);
    expect(script.headers['cache-control']).toBe('no-store');
    expect(css.headers['cache-control']).toBe('no-store');
    expect(script.text).toContain('/auth/oauth/authorizations/');
    expect(script.text).toContain("credentials: 'same-origin'");
    expect(script.text).toContain('fcr_pending_oauth_authorization');
  });

  it('retains an OAuth authorization id across same-tab founder login', async () => {
    const response = await request(app()).get('/assets/auth-callback.js');
    expect(response.status).toBe(200);
    expect(response.text).toContain('fcr_pending_oauth_authorization');
    expect(response.text).toContain("'/oauth/consent?authorization_id='");
    expect(response.text).toContain('sessionStorage.removeItem(pendingKey)');
  });
});
