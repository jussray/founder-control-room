/**
 * GitHub webhook endpoint.
 *
 * Validates HMAC-SHA256 signature → parses the verified raw body → persists to
 * inbox → enqueues targeted reconciliation. Responds 200 immediately; all
 * reconciliation processing is async.
 *
 * Supported events:
 *   check_run, pull_request, push, workflow_run, deployment, deployment_status
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { persistProviderEvent } from '../../events/inbox.js';
import { enqueueReconcile } from '../../events/outbox.js';
import { supabase } from '../../lib/supabaseClient.js';
import type { ProviderKind } from '../../reconciliation/types.js';

const SUPPORTED_EVENTS = new Set([
  'check_run',
  'pull_request',
  'push',
  'workflow_run',
  'deployment',
  'deployment_status',
]);

function verifySignature(secret: string, body: Buffer, sig: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function parseVerifiedPayload(body: Buffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body.toString('utf8')) as unknown;
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** Resolve project_id from the live project_connections schema. */
async function resolveProject(repoFullName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('project_connections')
    .select('project_id')
    .eq('connection_type', 'git')
    .eq('status', 'active')
    .filter('config->>repository', 'eq', repoFullName)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Project connection lookup failed', error);
    return null;
  }

  return data?.project_id ?? null;
}

function routeToController(
  eventType: string,
  payload: Record<string, unknown>,
): { controller: string; resourceId: string } | null {
  switch (eventType) {
    case 'check_run': {
      const cr = payload['check_run'] as Record<string, unknown>;
      return { controller: 'CheckRunController', resourceId: String(cr?.['id'] ?? '') };
    }
    case 'pull_request': {
      const pr = payload['pull_request'] as Record<string, unknown>;
      return { controller: 'ChangeProposalController', resourceId: String(pr?.['number'] ?? '') };
    }
    case 'push':
    case 'workflow_run':
      return { controller: 'ProjectController', resourceId: '' };
    case 'deployment':
    case 'deployment_status': {
      const dep = (payload['deployment'] ?? payload['deployment_status']) as Record<string, unknown>;
      return { controller: 'ReleaseController', resourceId: String(dep?.['id'] ?? '') };
    }
    default:
      return null;
  }
}

export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env['GITHUB_WEBHOOK_SECRET'];
  if (!secret) {
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: 'Webhook body must be raw JSON bytes' });
    return;
  }

  const sig = req.headers['x-hub-signature-256'] as string | undefined;
  if (!sig || !verifySignature(secret, rawBody, sig)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const payload = parseVerifiedPayload(rawBody);
  if (!payload) {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const eventType = req.headers['x-github-event'] as string | undefined;
  const deliveryId = req.headers['x-github-delivery'] as string | undefined;

  if (!eventType || !deliveryId) {
    res.status(400).json({ error: 'Missing GitHub event or delivery identifier' });
    return;
  }

  if (!SUPPORTED_EVENTS.has(eventType)) {
    res.status(200).json({ accepted: false, reason: 'unsupported event type' });
    return;
  }

  const repo = payload['repository'] as Record<string, unknown> | undefined;
  const repoFullName = repo?.['full_name'] as string | undefined;

  if (!repoFullName) {
    res.status(200).json({ accepted: false, reason: 'no repository in payload' });
    return;
  }

  const projectId = await resolveProject(repoFullName);
  if (!projectId) {
    // Not a registered project – silently accept to avoid GitHub retries.
    res.status(200).json({ accepted: false, reason: 'unregistered repository' });
    return;
  }

  const resourceInfo = routeToController(eventType, payload);
  if (!resourceInfo) {
    res.status(200).json({ accepted: false, reason: 'no controller for event' });
    return;
  }

  // 1. Persist to inbox (dedup on provider + deliveryId).
  let inboxResult;
  try {
    inboxResult = await persistProviderEvent({
      provider: 'github' as ProviderKind,
      projectId,
      providerEventId: deliveryId,
      eventType,
      resourceType: eventType,
      resourceId: resourceInfo.resourceId,
      payload,
    });
  } catch (err) {
    console.error('Inbox persist failed', err);
    res.status(500).json({ error: 'Failed to persist event' });
    return;
  }

  if (inboxResult.isDuplicate) {
    res.status(200).json({ accepted: true, duplicate: true });
    return;
  }

  // 2. Enqueue targeted reconciliation (with 500ms debounce for burst events).
  try {
    await enqueueReconcile(
      {
        projectId,
        controller: resourceInfo.controller,
        resourceId: resourceInfo.resourceId || undefined,
        reason: 'provider_event',
        sourceEventId: inboxResult.id,
      },
      { availableAt: new Date(Date.now() + 500).toISOString() },
    );
  } catch (err) {
    console.error('Outbox enqueue failed', err);
    // Still 200 – event is safely in inbox and can be replayed.
  }

  res.status(200).json({ accepted: true, eventId: inboxResult.id });
}
