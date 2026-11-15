import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const auth = vi.hoisted(() => ({ allowed: false }));
vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (_req: unknown, res: { status: (status: number) => { json: (x: unknown) => unknown } }, next: () => void) => {
    if (!auth.allowed) return res.status(401).json({ error: 'Founder session required' });
    next();
  },
}));

import { createOwnerInsightsRouter, parseEvidenceReviewInput, parseModelReview, getSearchConsoleSnapshot } from '../ownerInsights.js';

const payload = {
  projectSlug: 'jussray',
  claim: 'The company site is indexed by Google.',
  evidence: [{ id: 'sitemap', text: 'Sitemap exists but actual indexing is unknown.' }],
  consentToModel: true,
};
function app(options: Parameters<typeof createOwnerInsightsRouter>[0] = {}) {
  const server = express();
  server.use(express.json());
  server.use('/owner-insights', createOwnerInsightsRouter(options));
  return server;
}
beforeEach(() => { auth.allowed = false; });

describe('owner insights security and factual boundaries', () => {
  it('rejects unauthenticated GSC and model calls before calling a provider', async () => {
    const model = { run: vi.fn() };
    const server = app({ aiBinding: model });
    expect((await request(server).get('/owner-insights/search-console')).status).toBe(401);
    expect((await request(server).post('/owner-insights/challenge').send(payload)).status).toBe(401);
    expect(model.run).not.toHaveBeenCalled();
  });
  it('never turns missing Google authorization into invented zero-indexing metrics', async () => {
    auth.allowed = true;
    const result = await request(app({ gscCredential: () => '' })).get('/owner-insights/search-console');
    expect(result.status).toBe(503);
    expect(result.body.error).toBe('search_console_not_configured');
    expect(result.body.indexedPageCount).toBeUndefined();
  });
  it('requires explicit disclosure consent and bounded deduplicated evidence', () => {
    expect(parseEvidenceReviewInput({ ...payload, consentToModel: false })).toBeNull();
    expect(parseEvidenceReviewInput({ ...payload, evidence: [] })).toBeNull();
    expect(parseEvidenceReviewInput({ ...payload, evidence: [payload.evidence[0], payload.evidence[0]] })).toBeNull();
    expect(parseEvidenceReviewInput({ ...payload, projectSlug: '../bad' })).toBeNull();
    expect(parseEvidenceReviewInput(payload)).not.toBeNull();
  });
  it('rejects ambiguous model outputs and unauthorized gate labels', () => {
    expect(parseModelReview({ response: 'not JSON' })).toBeNull();
    expect(parseModelReview({ response: JSON.stringify({
      evidenceGaps: [], attackQuestions: [], nextGate: 'deploy', rationale: 'Approved',
    }) })).toBeNull();
  });
  it('sends only review input through uncached and unlogged AI Gateway; recommendation stays non-authoritative', async () => {
    auth.allowed = true;
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify({
      evidenceGaps: ['No Search Console URL Inspection receipt.'],
      attackQuestions: ['Which indexed URL proves this claim?'],
      nextGate: 'independent_verification',
      rationale: 'A sitemap does not prove Google indexing.',
    }) });
    const result = await request(app({ aiBinding: { run }, gscCredential: () => '' }))
      .post('/owner-insights/challenge').send(payload);
    expect(result.status).toBe(200);
    expect(result.body.authorityEffect).toBe('none');
    expect(result.body.verificationPerformed).toBe(false);
    expect(result.body.evidencePersisted).toBe(false);
    expect(result.body.inputFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(run.mock.calls[0][2]).toEqual({
      gateway: { id: 'default', skipCache: true, collectLog: false },
    });
  });
  it('fails closed if the AI Gateway binding is not available', async () => {
    auth.allowed = true;
    expect((await request(app()).post('/owner-insights/challenge').send(payload)).status).toBe(503);
  });
  it('preserves per-URL unknown statuses when Google inspection is unavailable', async () => {
    const crypto = await import('node:crypto');
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const credentials = JSON.stringify({
      client_email: 'test@demo.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string): Promise<Response> => {
      calls.push(url);
      if (url.endsWith('/token')) return Response.json({ access_token: 'test' });
      if (url.includes('/sitemaps')) return Response.json({ sitemap: [{ path: 'https://www.jussco.company/sitemap.xml', isPending: true }] });
      return Response.json({ error: 'inspection denied' }, { status: 403 });
    });
    const snapshot = await getSearchConsoleSnapshot(credentials, fakeFetch as unknown as typeof fetch);
    expect(snapshot.indexedPageCount).toBeNull();
    expect(snapshot.coverage).toBe('partial');
    expect((snapshot.sitemaps as { status: string }[])[0].status).toBe('processing');
    expect((snapshot.inspected as { error: string }[]).every((p) => p.error === 'inspection_unavailable')).toBe(true);
    expect(calls).toHaveLength(8);
  });
});
