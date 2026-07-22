/**
 * GitHub webhook endpoint.
 *
 * Validates HMAC-SHA256 signature → parses the verified raw body → persists to
 * inbox → enqueues targeted reconciliation for every controller the event
 * routes to. Responds 200 immediately; all reconciliation processing is
 * async. Product code is never included in Founder Control Room state; only
 * the sanitized provider event envelope is retained.
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
import { sanitizeWebhookPayload } from './sanitize.js';

const SUPPORTED_EVENTS = new Set([
  "check_run",
  "pull_request",
  "push",
  "workflow_run",
  "deployment",
  "deployment_status",
]);

interface ControllerRoute {
  controller: string;
  resourceId: string;
}

function verifySignature(secret: string, body: Buffer, signature: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
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
    throw new Error(`webhook_project_lookup_failed:${error.message}`);
  }

  return data?.project_id ?? null;
}

function routeToControllers(
  eventType: string,
  payload: Record<string, unknown>,
  repoFullName: string,
): ControllerRoute[] {
  switch (eventType) {
    case "check_run": {
      const checkRun = payload.check_run as Record<string, unknown> | undefined;
      return [{
        controller: "CheckRunController",
        resourceId: String(checkRun?.id ?? repoFullName),
      }];
    }
    case "pull_request": {
      const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
      return [{
        controller: "ChangeProposalController",
        resourceId: String(pullRequest?.number ?? repoFullName),
      }];
    }
    case "push":
    case "workflow_run":
      return [
        { controller: "ProjectController", resourceId: repoFullName },
        { controller: "ManifestController", resourceId: repoFullName },
      ];
    case "deployment":
    case "deployment_status": {
      const deployment = (payload.deployment ?? payload.deployment_status) as Record<string, unknown> | undefined;
      return [{
        controller: "ReleaseController",
        resourceId: String(deployment?.id ?? repoFullName),
      }];
    }
    default:
      return [];
  }
}

export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Webhook secret not configured" });
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
    res.status(200).json({ accepted: false, reason: "unsupported event type" });
    return;
  }

  const repository = payload.repository as Record<string, unknown> | undefined;
  const repoFullName = typeof repository?.full_name === "string" ? repository.full_name : null;
  if (!repoFullName) {
    res.status(200).json({ accepted: false, reason: "no repository in payload" });
    return;
  }

  let projectId: string | null;
  try {
    projectId = await resolveProject(repoFullName);
  } catch (error) {
    console.error("Project resolution failed", error);
    res.status(500).json({ error: "Failed to resolve project" });
    return;
  }
  if (!projectId) {
    // Not a registered project – silently accept to avoid GitHub retries.
    res.status(200).json({ accepted: false, reason: 'unregistered repository' });
    return;
  }

  const routes = routeToControllers(eventType, payload, repoFullName);
  if (routes.length === 0) {
    res.status(200).json({ accepted: false, reason: "no controller for event" });
    return;
  }

  // 1. Persist to inbox (dedup on provider + deliveryId). Only the
  // allowlisted envelope is stored — never the raw provider payload.
  let inboxResult;
  try {
    inboxResult = await persistProviderEvent({
      provider: "github" as ProviderKind,
      projectId,
      providerEventId: deliveryId,
      eventType,
      resourceType: eventType,
      resourceId: routes[0]?.resourceId ?? repoFullName,
      payload: sanitizeWebhookPayload(eventType, payload),
    });
  } catch (error) {
    console.error("Inbox persist failed", error);
    res.status(500).json({ error: "Failed to persist event" });
    return;
  }

  if (inboxResult.isDuplicate) {
    res.status(200).json({ accepted: true, duplicate: true });
    return;
  }

  // 2. Enqueue targeted reconciliation for every controller this event
  // routes to (with 500ms debounce for burst events).
  const availableAt = new Date(Date.now() + 500).toISOString();
  const results = await Promise.allSettled(
    routes.map((route) => enqueueReconcile(
      {
        projectId,
        controller: route.controller,
        resourceId: route.resourceId,
        reason: "provider_event",
        sourceEventId: inboxResult.id,
      },
      { availableAt },
    )),
  );
  const failedRoutes = results
    .map((result, index) => ({ result, route: routes[index] }))
    .filter((entry) => entry.result.status === "rejected")
    .map((entry) => entry.route?.controller)
    .filter(Boolean);

  if (failedRoutes.length > 0) {
    console.error("Outbox enqueue failed", { projectId, failedRoutes });
    // Event remains safely in the inbox and can be replayed.
  }

  res.status(200).json({
    accepted: true,
    eventId: inboxResult.id,
    controllers: routes.map((route) => route.controller),
    enqueueFailures: failedRoutes,
  });
}
