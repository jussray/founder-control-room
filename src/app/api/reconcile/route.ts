/**
 * POST /api/reconcile
 * Accepts a DriftReport payload from any registered service.
 * Publishes it directly to the inbox without triggering a remote call.
 *
 * This is the inbound webhook endpoint — services POST their reconcile
 * output here after running `npx tsx scripts/reconcile.ts`.
 *
 * Auth: X-Reconcile-Secret header must match RECONCILE_SHARED_SECRET env var.
 */
import { NextRequest, NextResponse } from 'next/server';

const SHARED_SECRET = process.env.RECONCILE_SHARED_SECRET;

export async function POST(req: NextRequest) {
  // Auth guard
  const secret = req.headers.get('x-reconcile-secret');
  if (SHARED_SECRET && secret !== SHARED_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Basic shape check before forwarding
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).service !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Missing required field: service' },
      { status: 422 }
    );
  }

  // Dynamic import to avoid circular deps at startup
  const { getInbox } = await import('@/src/events/inbox');
  const inbox = getInbox();
  await inbox.publish('reconciliation.report', body);

  return NextResponse.json({ ok: true }, { status: 202 });
}
