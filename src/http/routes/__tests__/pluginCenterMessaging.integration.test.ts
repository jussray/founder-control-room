import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStatus,
  mockSendGmailReply,
  mockSendWhatsAppReply,
  supabaseMock,
} = vi.hoisted(() => ({
  mockStatus: vi.fn(),
  mockSendGmailReply: vi.fn(),
  mockSendWhatsAppReply: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/growthInboxReply.js', () => ({
  growthInboxReplyStatus: mockStatus,
  sendGmailReply: mockSendGmailReply,
  sendWhatsAppReply: mockSendWhatsAppReply,
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.founder = { id: 'founder-user-1', email: 'founder@example.com' };
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import { pluginCenterMessagingRouter } from '../pluginCenterMessaging.js';

const PROJECT_ID = 'project-uuid-001';
const PROJECT_SLUG = 'founder-control-room';
const BRAND_ID = 'founder-control-room';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/plugin-center/messaging', pluginCenterMessagingRouter);
  return instance;
}

function projectLookup() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: { id: PROJECT_ID, slug: PROJECT_SLUG, name: 'Founder Control Room' },
          error: null,
        }),
      }),
    }),
  };
}

function approvedEmailRequest(overrides: Record<string, unknown> = {}) {
  return {
    channel: 'email',
    projectSlug: PROJECT_SLUG,
    brandId: BRAND_ID,
    purpose: 'support',
    gmailMessageId: 'gmail-message-1',
    body: 'Thanks, I can help with that.',
    idempotencyKey: 'reply-test-002',
    confirmSend: true,
    approvalScope: 'single_reply',
    confirmInboundReplyContext: true,
    confirmNoOptOut: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStatus.mockReturnValue({
    contract: 'fcr/growth-inbox-reply@v1',
    mode: 'draft_only',
    replyOnly: true,
    channels: {
      email: { configured: true, expectedAccount: 'founder@example.com', fingerprint: 'gmail:founder@example.com', missing: [] },
      whatsapp: { configured: false, phoneNumberId: null, wabaId: null, graphVersion: null, fingerprint: null, missing: ['FCR_WHATSAPP_ACCESS_TOKEN'] },
    },
  });
});

describe('GET /plugin-center/messaging/status', () => {
  it('exposes only readiness and account fingerprints, not credentials', async () => {
    const response = await request(app()).get('/plugin-center/messaging/status');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      contract: 'fcr/growth-inbox-reply@v1',
      mode: 'draft_only',
      replyOnly: true,
      channels: {
        email: { configured: true, fingerprint: 'gmail:founder@example.com' },
        whatsapp: { configured: false },
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('test-token');
  });
});

describe('POST /plugin-center/messaging/reply', () => {
  it('fails closed before persistence or provider execution without explicit single-reply approval', async () => {
    const response = await request(app())
      .post('/plugin-center/messaging/reply')
      .send(approvedEmailRequest({ confirmSend: false }));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('EXPLICIT_FOUNDER_SEND_APPROVAL_REQUIRED');
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(mockSendGmailReply).not.toHaveBeenCalled();
  });

  it('requires inbound-context and suppression attestations before persistence or provider execution', async () => {
    const response = await request(app())
      .post('/plugin-center/messaging/reply')
      .send(approvedEmailRequest({ confirmNoOptOut: false }));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('REPLY_POLICY_ATTESTATION_REQUIRED');
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(mockSendGmailReply).not.toHaveBeenCalled();
  });

  it('reserves the exact reply, obtains the canonical dispatch decision, then finalizes a successful email receipt', async () => {
    const executionId = 'exec-uuid-001';
    let reservedRequest: Record<string, unknown> | null = null;
    let finalizedUpdate: Record<string, unknown> | null = null;

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'approval_executions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          insert: (row: Record<string, unknown>) => {
            reservedRequest = row;
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: executionId, action_type: row.action_type, status: 'pending', request: row.request, result: {}, success: null },
                  error: null,
                }),
              }),
            };
          },
          update: (row: Record<string, unknown>) => {
            finalizedUpdate = row;
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: () => Promise.resolve({ data: { id: executionId, status: row.status }, error: null }),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === 'projects') return projectLookup();
      return {};
    });

    mockSendGmailReply.mockResolvedValue({
      channel: 'email',
      providerMessageId: 'gmail-sent-1',
      threadId: 'thread-1',
      recipient: 'customer@example.net',
      account: 'founder@example.com',
    });

    const response = await request(app())
      .post('/plugin-center/messaging/reply')
      .send(approvedEmailRequest());

    expect(response.status).toBe(200);
    expect(mockSendGmailReply).toHaveBeenCalledWith({
      messageId: 'gmail-message-1',
      body: 'Thanks, I can help with that.',
    });
    expect(reservedRequest).toMatchObject({
      project_id: PROJECT_ID,
      action_type: 'growth_inbox_reply',
      idempotency_key: 'reply-test-002',
      executed_by: 'founder@example.com',
      status: 'pending',
      request: {
        contract: 'fcr/growth-inbox-reply@v1',
        mode: 'draft_only',
        replyOnly: true,
        channel: 'email',
        projectSlug: PROJECT_SLUG,
        brandId: BRAND_ID,
        purpose: 'support',
        approval: 'founder_explicit_single_reply',
        replyTarget: 'gmail-message:gmail-message-1',
      },
    });
    expect(JSON.stringify(reservedRequest)).not.toContain('Thanks, I can help with that.');
    expect(finalizedUpdate).toMatchObject({ status: 'succeeded', success: true });
    expect(response.body.dispatchDecision).toMatchObject({
      decision: 'allow',
      policyVersion: 'fcr/reply-only-dispatch@v1',
      denialReasons: [],
    });
    expect(response.body.dispatchDecision.checks.every((check: { state: string }) => check.state === 'allow')).toBe(true);
    expect(response.body).toMatchObject({
      contract: 'fcr/growth-inbox-reply@v1',
      status: 'succeeded',
      executionId,
      result: { providerMessageId: 'gmail-sent-1', threadId: 'thread-1' },
    });
  });

  it('requires an existing WhatsApp message identifier instead of allowing unbound outbound text', async () => {
    const response = await request(app())
      .post('/plugin-center/messaging/reply')
      .send({
        channel: 'whatsapp',
        projectSlug: PROJECT_SLUG,
        brandId: BRAND_ID,
        purpose: 'support',
        whatsappRecipientWaId: '15551234567',
        body: 'Reply body',
        idempotencyKey: 'reply-test-003',
        confirmSend: true,
        approvalScope: 'single_reply',
        confirmInboundReplyContext: true,
        confirmNoOptOut: true,
        confirmWithinProviderReplyWindow: true,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('whatsappReplyToMessageId');
    expect(mockSendWhatsAppReply).not.toHaveBeenCalled();
  });
});
