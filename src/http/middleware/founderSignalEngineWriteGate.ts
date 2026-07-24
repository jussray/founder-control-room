import type { RequestHandler } from 'express';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rpcId(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

/**
 * Fail-closed authority boundary for the first Founder Signal Engine bridge.
 *
 * The current Control Room approval registry cannot represent social publishing
 * or HubSpot mutation. Until a registry-backed approval receipt exists, the
 * deployed MCP endpoint may generate content and queue review drafts, but it
 * must never publish, send, or write to HubSpot from caller-supplied approval
 * text alone.
 */
export const requireFounderSignalEngineReviewOnly: RequestHandler = (req, res, next) => {
  const body = isRecord(req.body) ? req.body : null;
  if (!body || body.method !== 'tools/call') {
    next();
    return;
  }

  const params = isRecord(body.params) ? body.params : null;
  const args = params && isRecord(params.arguments) ? params.arguments : null;
  if (!args) {
    next();
    return;
  }

  const requestedAction = args.requestedAction;
  const allowHubSpotWrite = args.allowHubSpotWrite === true;
  if (requestedAction !== 'publish_or_send' && !allowHubSpotWrite) {
    next();
    return;
  }

  res.status(403).json({
    jsonrpc: '2.0',
    id: rpcId(body.id),
    error: {
      code: -32003,
      message: 'Registry-backed founder approval is required',
      data: {
        requestedAction,
        allowHubSpotWrite,
        nextGate:
          'Create and verify a dedicated Founder Signal Engine approval registry before enabling publication, sending, or HubSpot mutation.',
      },
    },
  });
};
