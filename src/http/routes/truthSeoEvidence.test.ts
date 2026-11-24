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
