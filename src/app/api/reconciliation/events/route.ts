/**
 * GET /api/reconciliation/events
 * Returns the latest reconciliation events from Supabase,
 * ordered by received_at desc. Used by the dashboard page.
 *
 * Query params:
 *   ?limit=50        (default 50, max 200)
 *   ?service=sekret-bip   (optional filter)
 *   ?status=drift_detected  (optional filter)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
  const service = searchParams.get('service');
  const status = searchParams.get('status');

  let query = supabase
    .from('reconciliation_events')
    .select('id, service, status, drift, received_at, duration_ms')
    .order('received_at', { ascending: false })
    .limit(limit);

  if (service) query = query.eq('service', service);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { events: data, count: data.length },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
