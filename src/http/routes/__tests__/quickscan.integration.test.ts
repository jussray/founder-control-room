import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({ supabaseAuth: { auth: { getUser: mockGetUser } } }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { quickScanRouter } from '../quickscan.js';
import { resetQuickScanStoreForTests } from '../../../quickscan/store.js';

const BEARER = 'Bearer test-token';
const FOUNDER_EMAIL = 'founder@example.com';

function buildApp() { const app = express(); app.use(express.json()); app.use('/quickscan', quickScanRouter); return app; }
function founderSession() { mockGetUser.mockResolvedValue({ data: { user: { id: 'founder-1', email: FOUNDER_EMAIL } }, error: null }); }
function founderUsersRow() { return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }) }) }) }; }

beforeEach(() => {
  vi.clearAllMocks();
  resetQuickScanStoreForTests();
  supabaseMock.from.mockImplementation((table: string) => table === 'founder_users' ? founderUsersRow() : {});
});

describe('QuickScan founder-gated API', () => {
  it('rejects unauthenticated reads', async () => {
    const response = await request(buildApp()).get('/quickscan');
    expect(response.status).toBe(401);
  });

  it('exposes bounded architecture with external execution disabled', async () => {
    founderSession();
    const response = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
    expect(response.status).toBe(200);
    expect(response.body.authority).toMatchObject({ sendExternal: false, scrape: false, executeN8n: false });
    expect(response.body.architecture).toMatchObject({ chief: 'replaceable-reasoning', promptos: 'versioned-workflow-provenance', n8n: 'orchestration-disabled-v1' });
  });

  it('reports whether the Stripe QuickScan webhook is configured, without leaking the secret', async () => {
    const original = process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET;
    try {
      delete process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET;
      founderSession();
      let response = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
      expect(response.body.authority.stripeWebhookConfigured).toBe(false);

      process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET = 'whsec_test';
      response = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
      expect(response.body.authority.stripeWebhookConfigured).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('whsec_test');
    } finally {
      if (original === undefined) delete process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET;
      else process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET = original;
    }
  });

  it('does not permit a direct contacted -> paid lifecycle jump', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Example Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;
    const researched = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'researched' });
    expect(researched.status).toBe(200);
    const blocked = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'paid' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('TRANSITION_BLOCKED');
  });

  it('requires qualification, approval, ordered payment state, and evidence before manual paid truth', async () => {
    founderSession();
    let response = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Busy Esthetics', ownerName: 'Jae', segment: 'salon_studio_team_owner' });
    const id = response.body.prospect.id;

    for (const category of ['visible_friction','active_demand','owner_reachable','repeat_high_value_service','operational_complexity','urgency']) {
      await request(buildApp()).post(`/quickscan/prospects/${id}/evidence`).set('Authorization', BEARER).send({ category, note: `Observed ${category}` });
    }
    for (const to of ['researched','qualified_for_outreach','draft_ready','approved_to_contact','contacted','replied','fit_check_scheduled']) {
      response = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to });
      expect(response.status).toBe(200);
    }
    response = await request(buildApp()).post(`/quickscan/prospects/${id}/qualification`).set('Authorization', BEARER).send({ pain: 'Missed DMs', frequency: 'daily', economicImpact: 'one booking exceeds fee', authority: 'confirmed', urgency: 'now', decision: 'qualified' });
    expect(response.status).toBe(200);

    response = await request(buildApp()).post(`/quickscan/prospects/${id}/approvals`).set('Authorization', BEARER).send({ action: 'payment_link', proposedAction: 'Offer the $249 QuickScan payment link', reason: 'Qualified buyer requested next step', evidenceIds: [] });
    const approvalId = response.body.approval.id;
    await request(buildApp()).post(`/quickscan/prospects/${id}/approvals/${approvalId}/decision`).set('Authorization', BEARER).send({ decision: 'APPROVE' });

    response = await request(buildApp()).post(`/quickscan/prospects/${id}/payment/manual`).set('Authorization', BEARER).send({ status: 'paid', evidence: 'manual receipt' });
    expect(response.status).toBe(409);

    response = await request(buildApp()).post(`/quickscan/prospects/${id}/payment/manual`).set('Authorization', BEARER).send({ status: 'link_ready', paymentLinkUrl: 'https://buy.stripe.com/example' });
    expect(response.body.trackedPaymentLinkUrl).toBe(`https://buy.stripe.com/example?client_reference_id=${id}`);
    await request(buildApp()).post(`/quickscan/prospects/${id}/payment/manual`).set('Authorization', BEARER).send({ status: 'link_sent' });
    response = await request(buildApp()).post(`/quickscan/prospects/${id}/payment/manual`).set('Authorization', BEARER).send({ status: 'paid' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PAYMENT_EVIDENCE_REQUIRED');

    response = await request(buildApp()).post(`/quickscan/prospects/${id}/payment/manual`).set('Authorization', BEARER).send({ status: 'paid', evidence: 'Stripe dashboard receipt recorded manually' });
    expect(response.status).toBe(200);
    expect(response.body.externalMutation).toBe(false);
    expect(response.body.stripeWebhookVerified).toBe(false);
    expect(response.body.prospect.lifecycleState).toBe('paid');

    for (const to of ['diagnostic_scheduled', 'diagnostic_complete', 'delivery_due']) {
      response = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to });
      expect(response.status).toBe(200);
    }

    response = await request(buildApp()).post(`/quickscan/prospects/${id}/delivery`).set('Authorization', BEARER).send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DELIVERY_BLOCKED');

    response = await request(buildApp()).post(`/quickscan/prospects/${id}/delivery`).set('Authorization', BEARER).send({ loomUrl: 'https://loom.com/share/example' });
    expect(response.status).toBe(200);
    expect(response.body.prospect.lifecycleState).toBe('delivered');
    expect(response.body.prospect.delivery.loomUrl).toBe('https://loom.com/share/example');
  });

  it('does not permit the generic transition route to reach evidence-gated states directly', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Bypass Attempt Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;
    for (const category of ['visible_friction','active_demand','owner_reachable','repeat_high_value_service','operational_complexity','urgency']) {
      await request(buildApp()).post(`/quickscan/prospects/${id}/evidence`).set('Authorization', BEARER).send({ category, note: `Observed ${category}` });
    }
    for (const to of ['researched','qualified_for_outreach','draft_ready','approved_to_contact','contacted','replied','fit_check_scheduled']) {
      await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to });
    }
    await request(buildApp()).post(`/quickscan/prospects/${id}/qualification`).set('Authorization', BEARER).send({ pain: 'Missed DMs', frequency: 'daily', economicImpact: 'one booking exceeds fee', authority: 'confirmed', urgency: 'now', decision: 'qualified' });

    let response = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'payment_link_ready' });
    expect(response.status).toBe(200);
    response = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'payment_link_sent' });
    expect(response.status).toBe(200);

    const bypassPaid = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'paid' });
    expect(bypassPaid.status).toBe(409);
    expect(bypassPaid.body.code).toBe('TRANSITION_BLOCKED');
    expect(bypassPaid.body.message).toContain('evidence-gated');
  });
});
