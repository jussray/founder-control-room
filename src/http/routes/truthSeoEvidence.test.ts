import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock('../middleware/requireFounder.js', () => ({
  requireFounder: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../lib/evidenceGatewayReview.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/evidenceGatewayReview.js')>();
  return { ...actual, reviewEvidence: mocks.review };
});

const gscMocks=vi.hoisted(()=>({token:vi.fn(),snapshot:vi.fn()}));
vi.mock('../../lib/searchConsoleRead.js',async(importOriginal)=>{
  const original=await importOriginal<typeof import('../../lib/searchConsoleRead.js')>();
  return {...original,getGscAccessToken:gscMocks.token,readGscSnapshot:gscMocks.snapshot};
});

const { intelligenceRouter } = await import('./truthSeoEvidence.js');
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/dashboard/truth/intelligence', intelligenceRouter);
  return app;
}
const input = {
  claim: 'Our public site has five sampled pages that Google has indexed',
  evidence: [{ id: 'one', source: 'Search Console inspection', text: 'Five URLs were inspected in a bounded read' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  gscMocks.token.mockReset();
  gscMocks.snapshot.mockReset();
  vi.stubEnv('CF_ACCOUNT_ID', 'a'.repeat(32));
  vi.stubEnv('FCR_EVIDENCE_GATEWAY_ID', 'fcr-evidence');
  vi.stubEnv('FCR_EVIDENCE_GATEWAY_TOKEN', 'test-only-gateway-token');
  vi.stubEnv('OPENAI_API_KEY', 'test-only-provider-key');
  mocks.review.mockResolvedValue({
    contract: 'fcr/evidence-gaps@v1',
    basis: 'MODEL_ANALYSIS_NOT_VERIFIED',
    authorityGranted: false,
    gaps: [], attackQuestions: [],
    nextGate: { gate: 'COLLECT_EVIDENCE', reason: 'More evidence is required', requiredEvidence: [] },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('canonical Truth Console AI review', () => {
  it('rejects missing or false evidence transfer consent before model access', async () => {
    const absent = await request(createApp()).post('/dashboard/truth/intelligence/review').send(input);
    const denied = await request(createApp()).post('/dashboard/truth/intelligence/review')
      .send({ ...input, shareEvidenceWithModel: false });
    expect(absent.status).toBe(400);
    expect(denied.status).toBe(400);
    expect(absent.body.error).toBe('explicit_model_consent_required');
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('keeps founder-authenticated review advisory and strips consent from model evidence schema', async () => {
    const response = await request(createApp()).post('/dashboard/truth/intelligence/review')
      .send({ ...input, shareEvidenceWithModel: true });
    expect(response.status).toBe(200);
    expect(response.body.authorityGranted).toBe(false);
    expect(response.body.basis).toBe('MODEL_ANALYSIS_NOT_VERIFIED');
    expect(mocks.review).toHaveBeenCalledTimes(1);
    expect(mocks.review.mock.calls[0]?.[0]).toEqual(input);
  });
  it('blocks unconfigured gateway access without invoking the model', async () => {
    vi.stubEnv('FCR_EVIDENCE_GATEWAY_TOKEN', '');
    const response = await request(createApp()).post('/dashboard/truth/intelligence/review')
      .send({ ...input, shareEvidenceWithModel: true });
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('fcr_gateway_not_configured');
    expect(mocks.review).not.toHaveBeenCalled();
  });
});


describe('Search Console multi-site allowlist and isolated cache',()=>{
  it('rejects untrusted site selectors before asking Google for credentials',async()=>{
    const denied=await request(createApp()).get('/dashboard/truth/intelligence/seo?site=https://outside.example');
    expect(denied.status).toBe(400);
    expect(denied.body.error).toBe('invalid_site_selection');
    expect(gscMocks.token).not.toHaveBeenCalled();
    expect(gscMocks.snapshot).not.toHaveBeenCalled();
  });
  it('reads Juss & Co from its own property without returning the cached FCR result',async()=>{
    vi.stubEnv('FCR_GSC_OAUTH_JSON','test-bounded-auth-secret');
    gscMocks.token.mockResolvedValue('test-token-with-length');
    gscMocks.snapshot.mockImplementation(async (input:{site:string})=>({
      property:input.site==='jussco'?'sc-domain:jussco.company':'https://www.foundercontrolroom.org/',
      checkedAt:'2026-11-26T00:00:00Z',sitemaps:[],pages:[],indexedCount:null
    }));
    const jussco=await request(createApp()).get('/dashboard/truth/intelligence/seo?site=jussco');
    const fcr=await request(createApp()).get('/dashboard/truth/intelligence/seo?site=fcr');
    expect(jussco.status).toBe(200);
    expect(fcr.status).toBe(200);
    expect(jussco.body.property).toBe('sc-domain:jussco.company');
    expect(fcr.body.property).toBe('https://www.foundercontrolroom.org/');
    expect(gscMocks.snapshot).toHaveBeenCalledWith({token:'test-token-with-length',site:'jussco'});
    expect(gscMocks.snapshot).toHaveBeenCalledWith({token:'test-token-with-length',site:'fcr'});
  });
});
