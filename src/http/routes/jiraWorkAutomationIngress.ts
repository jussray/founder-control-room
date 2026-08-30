import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import {
  dispatchJiraWorkAutomation,
  validateJiraWorkAutomationInput,
  type JiraWorkAutomationInput,
  type JiraWorkAutomationDispatchResult,
} from '../../lib/jiraWorkAutomation.js';

const MAX_TRANSPORT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_OBSERVATION_AGE_MS = 5 * 60 * 1000;
const MAX_OBSERVATION_FUTURE_SKEW_MS = 30 * 1000;
const MIN_INGRESS_SECRET_LENGTH = 32;
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const ALLOWED_FIELDS = new Set([
  'event',
  'projectKey',
  'issueKey',
  'fromStatus',
  'toStatus',
  'assigneeAccountId',
  'updatedAt',
  'observedAt',
]);

export type JiraWorkAutomationDispatcher = (
  input: JiraWorkAutomationInput,
) => Promise<JiraWorkAutomationDispatchResult>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function safeEqualHex(left: string, right: string): boolean {
  if (!HEX_SHA256.test(left) || !HEX_SHA256.test(right)) return false;
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifyJiraWorkAutomationIngressSignature(
  rawBody: Uint8Array,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  secret: string,
  nowMs: number,
): { valid: boolean; signedAtMs: number | null } {
  if (!timestampHeader || !/^\d{13}$/.test(timestampHeader)) {
    return { valid: false, signedAtMs: null };
  }

  const signedAtMs = Number(timestampHeader);
  if (!Number.isSafeInteger(signedAtMs) || Math.abs(nowMs - signedAtMs) > MAX_TRANSPORT_CLOCK_SKEW_MS) {
    return { valid: false, signedAtMs: null };
  }

  const expected = createHmac('sha256', secret)
    .update(timestampHeader, 'utf8')
    .update('.', 'utf8')
    .update(rawBody)
    .digest('hex');

  return {
    valid: safeEqualHex(signatureHeader ?? '', expected),
    signedAtMs,
  };
}

export function parseJiraWorkAutomationIngressInput(
  value: unknown,
  signedAtMs: number,
): { input: JiraWorkAutomationInput | null; reasons: string[] } {
  if (!isRecord(value)) {
    return { input: null, reasons: ['jira automation ingress body must be an object'] };
  }

  const reasons: string[] = [];
  const unexpectedFields = Object.keys(value).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unexpectedFields.length > 0) {
    reasons.push(`unexpected fields are forbidden: ${unexpectedFields.sort().join(', ')}`);
  }

  for (const field of ['event', 'projectKey', 'issueKey', 'toStatus', 'updatedAt', 'observedAt'] as const) {
    if (typeof value[field] !== 'string') reasons.push(`${field} must be a string`);
  }
  for (const field of ['fromStatus', 'assigneeAccountId'] as const) {
    if (Object.hasOwn(value, field) && value[field] !== null && typeof value[field] !== 'string') {
      reasons.push(`${field} must be a string or null`);
    }
  }

  if (reasons.length > 0) return { input: null, reasons: [...new Set(reasons)] };

  const input: JiraWorkAutomationInput = {
    event: value.event as JiraWorkAutomationInput['event'],
    projectKey: value.projectKey as string,
    issueKey: value.issueKey as string,
    fromStatus: Object.hasOwn(value, 'fromStatus') ? value.fromStatus as string | null : null,
    toStatus: value.toStatus as string,
    assigneeAccountId: Object.hasOwn(value, 'assigneeAccountId') ? value.assigneeAccountId as string | null : null,
    updatedAt: value.updatedAt as string,
    observedAt: value.observedAt as string,
  };

  reasons.push(...validateJiraWorkAutomationInput(input));

  const observedAtMs = Date.parse(input.observedAt);
  if (Number.isFinite(observedAtMs)) {
    if (signedAtMs - observedAtMs > MAX_OBSERVATION_AGE_MS) {
      reasons.push('observedAt is too old for this signed transport');
    }
    if (observedAtMs - signedAtMs > MAX_OBSERVATION_FUTURE_SKEW_MS) {
      reasons.push('observedAt cannot materially postdate the signed transport');
    }
  }

  return reasons.length > 0
    ? { input: null, reasons: [...new Set(reasons)] }
    : { input, reasons: [] };
}

export function createJiraWorkAutomationIngressHandler(
  dispatcher: JiraWorkAutomationDispatcher = dispatchJiraWorkAutomation,
  options: { now?: () => number } = {},
): RequestHandler {
  return async function handleJiraWorkAutomationIngress(req: Request, res: Response) {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });

    const secret = process.env.FCR_JIRA_AUTOMATION_INGRESS_SECRET?.trim();
    if (!secret || secret.length < MIN_INGRESS_SECRET_LENGTH) {
      return res.status(503).json({
        ok: false,
        code: 'JIRA_AUTOMATION_INGRESS_NOT_CONFIGURED',
      });
    }

    if (!(req.body instanceof Uint8Array)) {
      return res.status(400).json({ ok: false, code: 'RAW_JSON_BODY_REQUIRED' });
    }

    const signature = verifyJiraWorkAutomationIngressSignature(
      req.body,
      req.get('x-fcr-jira-timestamp'),
      req.get('x-fcr-jira-signature'),
      secret,
      options.now?.() ?? Date.now(),
    );
    if (!signature.valid || signature.signedAtMs === null) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(req.body));
    } catch {
      return res.status(400).json({ ok: false, code: 'INVALID_JSON' });
    }

    const envelope = parseJiraWorkAutomationIngressInput(parsed, signature.signedAtMs);
    if (!envelope.input) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_JIRA_AUTOMATION_OBSERVATION',
        reasons: envelope.reasons,
      });
    }

    try {
      const result = await dispatcher(envelope.input);
      return res.status(result.status).json({
        ok: result.ok,
        code: result.code,
        receiptId: result.receiptId,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        code: 'JIRA_AUTOMATION_DISPATCH_UNAVAILABLE',
        receiptId: null,
      });
    }
  };
}

export const handleJiraWorkAutomationIngress = createJiraWorkAutomationIngressHandler();
