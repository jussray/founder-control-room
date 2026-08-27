import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({ supabaseAuth: { auth: { getUser: mockGetUser } } }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { createQuickScanRouter, quickScanRouter, type QuickScanRouteDependencies } from '../quickscan.js';
import { resetQuickScanStoreForTests } from '../../../quickscan/store.js';
import { QuickScanChiefProviderError } from '../../../quickscan/chiefOpenaiClient.js';
import { QUICKSCAN_CHIEF_WORKFLOW, type QuickScanChiefPromptInput } from '../../../quickscan/chiefPrompts.js';
import type { ChiefQuickScanRecommendation } from '../../../quickscan/contracts.js';

const BEARER = 'Bearer test-token';
const FOUNDER_EMAIL = 'founder@example.com';

function buildApp() { const app = express(); app.use(express.json()); app.use('/quickscan', quickScanRouter); return app; }
function buildAppWithChief(dependencies: QuickScanRouteDependencies) { const app = express(); app.use(express.json()); app.use('/quickscan', createQuickScanRouter(dependencies)); return app; }
function chiefRecommendation(overrides: Partial<ChiefQuickScanRecommendation> = {}): ChiefQuickScanRecommendation {
  return {
    summary: 'Clear evidence of missed booking requests.',
    nextAction: 'approve_outreach',
    messageDraft: 'Hey Maya — do booking requests in comments ever slip through?',
    promptWorkflow: QUICKSCAN_CHIEF_WORKFLOW,
    ...overrides,
  };
}
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

    const bypassQualified = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'qualified' });
    expect(bypassQualified.status).toBe(409);
    expect(bypassQualified.body.code).toBe('TRANSITION_BLOCKED');
    expect(bypassQualified.body.message).toContain('evidence-gated');

    await request(buildApp()).post(`/quickscan/prospects/${id}/qualification`).set('Authorization', BEARER).send({ pain: 'Missed DMs', frequency: 'daily', economicImpact: 'one booking exceeds fee', authority: 'confirmed', urgency: 'now', decision: 'qualified' });

    const bypassPaymentLinkReady = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'payment_link_ready' });
    expect(bypassPaymentLinkReady.status).toBe(409);
    expect(bypassPaymentLinkReady.body.code).toBe('TRANSITION_BLOCKED');

    // No qualification decision or approval yet: /payment/manual refuses too — the
    // precursor gate does not just relocate the bypass to a different route.
    const noApproval = await request(buildApp()).post(`/quickscan/prospects/${id}/payment/manual`).set('Authorization', BEARER).send({ status: 'link_ready', paymentLinkUrl: 'https://buy.stripe.com/example' });
    expect(noApproval.status).toBe(409);
    expect(noApproval.body.code).toBe('PAYMENT_APPROVAL_REQUIRED');

    const approval = await request(buildApp()).post(`/quickscan/prospects/${id}/approvals`).set('Authorization', BEARER).send({ action: 'payment_link', proposedAction: 'Offer the $249 QuickScan payment link', reason: 'Qualified buyer requested next step', evidenceIds: [] });
    await request(buildApp()).post(`/quickscan/prospects/${id}/approvals/${approval.body.approval.id}/decision`).set('Authorization', BEARER).send({ decision: 'APPROVE' });

    let response = await request(buildApp()).post(`/quickscan/prospects/${id}/payment/manual`).set('Authorization', BEARER).send({ status: 'link_ready', paymentLinkUrl: 'https://buy.stripe.com/example' });
    expect(response.status).toBe(200);

    const bypassPaymentLinkSent = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'payment_link_sent' });
    expect(bypassPaymentLinkSent.status).toBe(409);
    expect(bypassPaymentLinkSent.body.code).toBe('TRANSITION_BLOCKED');

    response = await request(buildApp()).post(`/quickscan/prospects/${id}/payment/manual`).set('Authorization', BEARER).send({ status: 'link_sent' });
    expect(response.status).toBe(200);

    const bypassPaid = await request(buildApp()).post(`/quickscan/prospects/${id}/transition`).set('Authorization', BEARER).send({ to: 'paid' });
    expect(bypassPaid.status).toBe(409);
    expect(bypassPaid.body.code).toBe('TRANSITION_BLOCKED');
    expect(bypassPaid.body.message).toContain('evidence-gated');
  });

  it('reports whether QuickScan Chief is configured, without leaking the key', async () => {
    const original = process.env.OPENAI_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      founderSession();
      let response = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
      expect(response.body.authority.chiefConfigured).toBe(false);

      process.env.OPENAI_API_KEY = 'sk-test';
      response = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
      expect(response.body.authority.chiefConfigured).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('sk-test');
    } finally {
      if (original === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = original;
    }
  });

  it('records a Chief recommendation and auto-proposes the matching approval for a send-worthy next action', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Glow Studio', ownerName: 'Maya', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;
    await request(buildApp()).post(`/quickscan/prospects/${id}/evidence`).set('Authorization', BEARER).send({ category: 'visible_friction', note: 'Customers ask about availability in comments.' });

    const runChief = vi.fn(async (_input: QuickScanChiefPromptInput) => ({
      recommendation: chiefRecommendation(),
      provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_1', promptVersion: 'quickscan-chief-v1-test' },
    }));
    const response = await request(buildAppWithChief({ runChief })).post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });

    expect(response.status).toBe(200);
    expect(runChief).toHaveBeenCalledTimes(1);
    expect(runChief.mock.calls[0][0]).toMatchObject({ businessName: 'Glow Studio', ownerName: 'Maya', segment: 'salon_studio_team_owner' });
    expect(response.body.prospect.chiefRecommendation).toMatchObject({ nextAction: 'approve_outreach', promptWorkflow: QUICKSCAN_CHIEF_WORKFLOW });
    expect(response.body.approval).toMatchObject({ action: 'outreach', recommendedBy: 'chief', decision: 'PENDING', proposedAction: chiefRecommendation().messageDraft });
    expect(response.body.prospect.approvals).toHaveLength(1);
    expect(response.body.prospect.audit.some((entry: { type: string }) => entry.type === 'chief.recommendation')).toBe(true);
    expect(response.body.prospect.audit.some((entry: { type: string; message: string }) => entry.type === 'chief.recommendation.provenance' && entry.message.includes('resp_1') && entry.message.includes('gpt-5-mini'))).toBe(true);
  });

  it('refuses to run Chief without an explicit data-sharing acknowledgement', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'No Ack Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;

    const runChief = vi.fn();
    const response = await request(buildAppWithChief({ runChief })).post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DATA_SHARING_ACKNOWLEDGEMENT_REQUIRED');
    expect(runChief).not.toHaveBeenCalled();
  });

  it('rejects the Chief recommendation without reverting a mutation that landed while the provider call was in flight', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Race Condition Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;
    const app = buildAppWithChief({
      runChief: vi.fn(async () => {
        // Simulate another request (e.g. the founder adding evidence) landing
        // while this provider call is still in flight. The recommendation
        // below was reasoned out before that evidence existed, so applying
        // it now would misattribute its basis.
        await request(app).post(`/quickscan/prospects/${id}/evidence`).set('Authorization', BEARER).send({ category: 'urgency', note: 'Mutated mid-flight.' });
        return { recommendation: chiefRecommendation({ nextAction: 'capture_more_evidence', messageDraft: undefined }), provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_race', promptVersion: 'quickscan-chief-v1-test' } };
      }),
    });

    const response = await request(app).post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QUICKSCAN_CHIEF_INPUT_CHANGED');

    // The concurrent mutation itself (saved by its own request) must survive
    // untouched — this handler must neither revert it nor attach a stale
    // recommendation to it.
    const after = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
    const stored = after.body.prospects.find((item: { id: string }) => item.id === id);
    expect(stored.evidence).toHaveLength(1);
    expect(stored.evidence[0].note).toBe('Mutated mid-flight.');
    expect(stored.chiefRecommendation).toBeUndefined();
    expect(stored.approvals).toHaveLength(0);
  });

  it('supersedes an earlier pending Chief approval instead of piling up duplicates', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Repeat Ask Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;

    const first = await request(buildAppWithChief({ runChief: vi.fn(async () => ({ recommendation: chiefRecommendation({ messageDraft: 'First draft.' }), provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_first', promptVersion: 'quickscan-chief-v1-test' } })) }))
      .post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });
    expect(first.body.prospect.approvals).toHaveLength(1);
    const firstApprovalId = first.body.approval.id;

    const second = await request(buildAppWithChief({ runChief: vi.fn(async () => ({ recommendation: chiefRecommendation({ messageDraft: 'Second draft.' }), provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_second', promptVersion: 'quickscan-chief-v1-test' } })) }))
      .post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });

    expect(second.body.prospect.approvals).toHaveLength(2);
    const priorApproval = second.body.prospect.approvals.find((item: { id: string }) => item.id === firstApprovalId);
    expect(priorApproval.decision).toBe('SKIP');
    expect(second.body.approval.decision).toBe('PENDING');
    expect(second.body.approval.proposedAction).toBe('Second draft.');
  });

  it('supersedes an earlier pending Chief approval even when the newer recommendation is not send-worthy', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Cooling Off Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;

    const first = await request(buildAppWithChief({ runChief: vi.fn(async () => ({ recommendation: chiefRecommendation({ messageDraft: 'First draft.' }), provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_first', promptVersion: 'quickscan-chief-v1-test' } })) }))
      .post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });
    const firstApprovalId = first.body.approval.id;

    const second = await request(buildAppWithChief({ runChief: vi.fn(async () => ({ recommendation: chiefRecommendation({ nextAction: 'disqualify', messageDraft: undefined, summary: 'No longer a fit.' }), provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_second', promptVersion: 'quickscan-chief-v1-test' } })) }))
      .post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });

    expect(second.status).toBe(200);
    expect(second.body.approval).toBeNull();
    expect(second.body.prospect.approvals).toHaveLength(1);
    const priorApproval = second.body.prospect.approvals.find((item: { id: string }) => item.id === firstApprovalId);
    expect(priorApproval.decision).toBe('SKIP');
  });

  it('refuses to re-decide a Chief approval that supersession has already skipped', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'No Resurrection Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;

    const first = await request(buildAppWithChief({ runChief: vi.fn(async () => ({ recommendation: chiefRecommendation({ messageDraft: 'First draft.' }), provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_first', promptVersion: 'quickscan-chief-v1-test' } })) }))
      .post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });
    const firstApprovalId = first.body.approval.id;

    await request(buildAppWithChief({ runChief: vi.fn(async () => ({ recommendation: chiefRecommendation({ messageDraft: 'Second draft.' }), provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_second', promptVersion: 'quickscan-chief-v1-test' } })) }))
      .post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });

    const resurrect = await request(buildApp()).post(`/quickscan/prospects/${id}/approvals/${firstApprovalId}/decision`).set('Authorization', BEARER).send({ decision: 'APPROVE' });
    expect(resurrect.status).toBe(409);
    expect(resurrect.body.code).toBe('APPROVAL_BLOCKED');

    const after = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
    const stored = after.body.prospects.find((item: { id: string }) => item.id === id);
    const priorApproval = stored.approvals.find((item: { id: string }) => item.id === firstApprovalId);
    expect(priorApproval.decision).toBe('SKIP');
  });

  it('records a Chief recommendation without proposing an approval for an informational next action', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Thin Evidence Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;

    const runChief = vi.fn(async () => ({
      recommendation: chiefRecommendation({ nextAction: 'capture_more_evidence', messageDraft: undefined, summary: 'Not enough evidence yet.' }),
      provenance: { provider: 'openai' as const, model: 'gpt-5-mini', responseId: 'resp_2', promptVersion: 'quickscan-chief-v1-test' },
    }));
    const response = await request(buildAppWithChief({ runChief })).post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });

    expect(response.status).toBe(200);
    expect(response.body.prospect.chiefRecommendation.nextAction).toBe('capture_more_evidence');
    expect(response.body.approval).toBeNull();
    expect(response.body.prospect.approvals).toHaveLength(0);
  });

  it('returns 404 for a Chief recommendation on a prospect that does not exist', async () => {
    founderSession();
    const response = await request(buildAppWithChief({ runChief: vi.fn() })).post('/quickscan/prospects/does-not-exist/chief-recommendation').set('Authorization', BEARER).send({});
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PROSPECT_NOT_FOUND');
  });

  it('returns 503 when the Chief model provider is not configured', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Unconfigured Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;

    const runChief = vi.fn(async () => { throw new QuickScanChiefProviderError('not configured', 'OPENAI_NOT_CONFIGURED'); });
    const response = await request(buildAppWithChief({ runChief })).post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('OPENAI_NOT_CONFIGURED');
  });

  it('returns 502 when the Chief model provider fails', async () => {
    founderSession();
    const created = await request(buildApp()).post('/quickscan/prospects').set('Authorization', BEARER).send({ businessName: 'Flaky Provider Studio', segment: 'salon_studio_team_owner' });
    const id = created.body.prospect.id;

    const runChief = vi.fn(async () => { throw new QuickScanChiefProviderError('boom', 'OPENAI_HTTP_ERROR', 500); });
    const response = await request(buildAppWithChief({ runChief })).post(`/quickscan/prospects/${id}/chief-recommendation`).set('Authorization', BEARER).send({ acknowledgeDataSharing: true });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('OPENAI_HTTP_ERROR');
  });
});
