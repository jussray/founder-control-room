import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  growthInboxReplyStatus,
  sendGmailReply,
  sendWhatsAppReply,
  type GrowthInboxReplyChannel,
} from '../../lib/growthInboxReply.js';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const pluginCenterMessagingRouter = Router();
pluginCenterMessagingRouter.use(requireFounder);

const CONTRACT = 'fcr/growth-inbox-reply@v1' as const;
const PROJECT_SLUG = 'founder-control-room';
const ACTION_TYPE = 'growth_inbox_reply';
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;

type DbRecord = Record<string, unknown>;

type ReplyRequest = {
  channel?: unknown;
  body?: unknown;
  idempotencyKey?: unknown;
  confirmSend?: unknown;
  approvalScope?: unknown;
  gmailMessageId?: unknown;
  whatsappRecipientWaId?: unknown;
  whatsappReplyToMessageId?: unknown;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): DbRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DbRecord : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function channel(value: unknown): GrowthInboxReplyChannel | null {
  return value === 'email' || value === 'whatsapp' ? value : null;
}

function safeErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  if (/^[A-Z0-9_]+(?:_\d{3})?$/.test(code)) return code;
  return 'GROWTH_INBOX_PROVIDER_ERROR';
}

async function projectId(): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();
  if (error) throw new Error('GROWTH_INBOX_PROJECT_LOOKUP_FAILED');
  const row = record(data);
  const id = text(row?.id);
  if (!id) throw new Error('GROWTH_INBOX_PROJECT_NOT_REGISTERED');
  return id;
}

function requestFingerprint(input: {
  channel: GrowthInboxReplyChannel;
  body: string;
  gmailMessageId: string;
  whatsappRecipientWaId: string;
  whatsappReplyToMessageId: string;
}): string {
  return sha256(JSON.stringify({
    channel: input.channel,
    bodyHash: sha256(input.body),
    gmailMessageId: input.gmailMessageId || null,
    whatsappRecipientWaId: input.whatsappRecipientWaId || null,
    whatsappReplyToMessageId: input.whatsappReplyToMessageId || null,
  }));
}

async function existingExecution(idempotencyKey: string) {
  const { data, error } = await supabase
    .from('approval_executions')
    .select('id, action_type, status, request, result, success')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw new Error('GROWTH_INBOX_IDEMPOTENCY_LOOKUP_FAILED');
  return record(data);
}

async function reserveExecution(input: {
  projectId: string;
  idempotencyKey: string;
  founderEmail: string;
  channel: GrowthInboxReplyChannel;
  requestFingerprint: string;
  replyTarget: string;
}) {
  const id = randomUUID();
  const { data, error } = await supabase
    .from('approval_executions')
    .insert({
      id,
      mission_id: null,
      project_id: input.projectId,
      action_type: ACTION_TYPE,
      idempotency_key: input.idempotencyKey,
      executed_by: input.founderEmail,
      status: 'pending',
      request: {
        contract: CONTRACT,
        mode: 'draft_only',
        replyOnly: true,
        channel: input.channel,
        approval: 'founder_explicit_single_reply',
        requestFingerprint: input.requestFingerprint,
        replyTarget: input.replyTarget,
      },
      result: {},
      success: null,
    })
    .select('id, action_type, status, request, result, success')
    .single();
  if (error) {
    if (error.code === '23505') return null;
    throw new Error('GROWTH_INBOX_RESERVATION_FAILED');
  }
  return record(data);
}

async function finishExecution(
  executionId: string,
  status: 'succeeded' | 'failed',
  result: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('approval_executions')
    .update({
      status,
      result,
      success: status === 'succeeded',
      executed_at: new Date().toISOString(),
    })
    .eq('id', executionId)
    .eq('status', 'pending')
    .select('id, status')
    .maybeSingle();
  if (error) return false;
  const row = record(data);
  return text(row?.id) === executionId && text(row?.status) === status;
}

pluginCenterMessagingRouter.get('/status', (_req: FounderRequest, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json(growthInboxReplyStatus());
});

pluginCenterMessagingRouter.post('/reply', async (req: FounderRequest, res) => {
  res.set('Cache-Control', 'no-store');
  const body = (record(req.body) ?? {}) as ReplyRequest;
  const requestedChannel = channel(body.channel);
  const replyBody = text(body.body);
  const idempotencyKey = text(body.idempotencyKey);
  const gmailMessageId = text(body.gmailMessageId);
  const whatsappRecipientWaId = text(body.whatsappRecipientWaId);
  const whatsappReplyToMessageId = text(body.whatsappReplyToMessageId);

  if (!requestedChannel) return res.status(400).json({ error: 'channel must be email or whatsapp' });
  if (!replyBody) return res.status(400).json({ error: 'body is required' });
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return res.status(400).json({ error: 'idempotencyKey must be 8-128 safe characters' });
  }
  if (body.confirmSend !== true || body.approvalScope !== 'single_reply') {
    return res.status(403).json({
      error: 'EXPLICIT_FOUNDER_SEND_APPROVAL_REQUIRED',
      required: { confirmSend: true, approvalScope: 'single_reply' },
    });
  }
  if (requestedChannel === 'email' && !gmailMessageId) {
    return res.status(400).json({ error: 'gmailMessageId is required for an email reply' });
  }
  if (requestedChannel === 'whatsapp' && (!whatsappRecipientWaId || !whatsappReplyToMessageId)) {
    return res.status(400).json({
      error: 'whatsappRecipientWaId and whatsappReplyToMessageId are required for a WhatsApp reply',
    });
  }

  const fingerprint = requestFingerprint({
    channel: requestedChannel,
    body: replyBody,
    gmailMessageId,
    whatsappRecipientWaId,
    whatsappReplyToMessageId,
  });

  try {
    const existing = await existingExecution(idempotencyKey);
    if (existing) {
      const existingRequest = record(existing.request);
      if (text(existing.action_type) !== ACTION_TYPE || text(existingRequest?.requestFingerprint) !== fingerprint) {
        return res.status(409).json({ error: 'IDEMPOTENCY_KEY_SCOPE_MISMATCH' });
      }
      if (text(existing.status) === 'succeeded') {
        return res.status(200).json({
          contract: CONTRACT,
          replayed: true,
          status: 'succeeded',
          result: record(existing.result) ?? {},
        });
      }
      return res.status(409).json({
        error: text(existing.status) === 'pending'
          ? 'REPLY_EXECUTION_ALREADY_PENDING'
          : 'REPLY_EXECUTION_PREVIOUSLY_FAILED_USE_NEW_KEY_AFTER_REVIEW',
      });
    }

    const fcrProjectId = await projectId();
    const founderEmail = req.founder?.email?.trim() || 'founder';
    const replyTarget = requestedChannel === 'email'
      ? `gmail-message:${gmailMessageId}`
      : `whatsapp-message:${whatsappReplyToMessageId}`;
    const reservation = await reserveExecution({
      projectId: fcrProjectId,
      idempotencyKey,
      founderEmail,
      channel: requestedChannel,
      requestFingerprint: fingerprint,
      replyTarget,
    });

    if (!reservation) {
      return res.status(409).json({ error: 'REPLY_EXECUTION_RESERVATION_CONFLICT' });
    }
    const executionId = text(reservation.id);
    if (!executionId) return res.status(500).json({ error: 'GROWTH_INBOX_RESERVATION_INVALID' });

    try {
      const providerResult = requestedChannel === 'email'
        ? await sendGmailReply({ messageId: gmailMessageId, body: replyBody })
        : await sendWhatsAppReply({
          recipientWaId: whatsappRecipientWaId,
          replyToMessageId: whatsappReplyToMessageId,
          body: replyBody,
        });

      const auditResult = requestedChannel === 'email'
        ? {
          contract: CONTRACT,
          channel: 'email',
          providerMessageId: providerResult.providerMessageId,
          threadId: 'threadId' in providerResult ? providerResult.threadId : null,
          recipientHash: 'recipient' in providerResult ? sha256(providerResult.recipient) : null,
          accountFingerprint: 'account' in providerResult ? `gmail:${providerResult.account}` : null,
        }
        : {
          contract: CONTRACT,
          channel: 'whatsapp',
          providerMessageId: providerResult.providerMessageId,
          recipientHash: 'recipientWaId' in providerResult ? sha256(providerResult.recipientWaId) : null,
          accountFingerprint: 'phoneNumberId' in providerResult
            ? `whatsapp:phone=${providerResult.phoneNumberId}`
            : null,
        };

      const audited = await finishExecution(executionId, 'succeeded', auditResult);
      if (!audited) {
        return res.status(500).json({
          error: 'REPLY_SENT_BUT_AUDIT_FINALIZATION_UNCONFIRMED',
          providerAccepted: true,
          executionId,
        });
      }

      return res.status(200).json({
        contract: CONTRACT,
        replayed: false,
        status: 'succeeded',
        executionId,
        result: providerResult,
      });
    } catch (providerError) {
      const code = safeErrorCode(providerError);
      const audited = await finishExecution(executionId, 'failed', {
        contract: CONTRACT,
        channel: requestedChannel,
        error: code,
      });
      return res.status(code.endsWith('_INVALID') ? 400 : 502).json({
        error: code,
        executionId,
        auditFinalized: audited,
      });
    }
  } catch (error) {
    return res.status(500).json({ error: safeErrorCode(error) });
  }
});
