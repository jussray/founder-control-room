import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: vi.fn() } },
}));
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: { from: vi.fn() } }));

import request from 'supertest';
import { createServer } from '../server.js';

describe('public guardrail contract', () => {
  it('publishes a public-safe HTML status surface', async () => {
    const res = await request(createServer()).get('/guardrails');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain('<title>Founder Control Room Guardrails</title>');
    expect(res.text).toContain('data-guardrails="active"');
    expect(res.text).toContain('data-product-stage="operational-foundation"');
    expect(res.text).toContain('data-guardrail-id="FCR-AUTH-001"');
    expect(res.text).toContain('data-guardrail-id="FCR-APPROVAL-001"');
    expect(res.text).toContain('data-guardrail-id="FCR-AUTOMATION-001"');
    expect(res.text).toContain('data-guardrail-id="FCR-PROJECT-ISOLATION-001"');
    expect(res.text).toContain('data-guardrail-id="FCR-RLS-001"');
    expect(res.text).toContain('sensitiveFieldsIncluded=false');
    expect(res.text).toContain('standingMergeAuthority=true');
    expect(res.text).toContain('approvalCarryForward=false');
  });

  it('publishes minimized JSON without credentials or private product fields', async () => {
    const res = await request(createServer()).get('/guardrails.json');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.version).toBe('1.7.0');
    expect(res.body.sensitiveFieldsIncluded).toBe(false);
    expect(res.body.standingMergeAuthority).toBe(true);
    expect(res.body.approvalCarryForward).toBe(false);
    expect(res.body.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'FCR-AUTH-001', status: 'active' }),
        expect.objectContaining({ id: 'FCR-APPROVAL-001', status: 'active' }),
        expect.objectContaining({
          id: 'FCR-AUTOMATION-001',
          status: 'partial',
          summary: expect.stringContaining('OpenAI key execution'),
        }),
        expect.objectContaining({
          id: 'FCR-PROJECT-ISOLATION-001',
          status: 'active',
          summary: expect.stringContaining('mid-request reassignment'),
        }),
        expect.objectContaining({
          id: 'FCR-RLS-001',
          status: 'partial',
          summary: expect.stringContaining('live Supabase project'),
        }),
      ]),
    );

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|Bearer\s+[A-Za-z0-9._-]+|service_role_key/i,
    );
    expect(serialized).not.toMatch(
      /journal_text|voice_transcript|private_companion|teen_journal|founder_email/i,
    );
  });

  it('keeps health public and project state founder-protected', async () => {
    const app = createServer();
    const health = await request(app).get('/health');
    const project = await request(app).get('/projects/sekret-bip');

    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });
    expect([401, 403]).toContain(project.status);
  });
});
