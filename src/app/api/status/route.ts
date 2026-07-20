/**
 * GET /api/status
 * Deep readiness probe — checks Supabase DB connectivity.
 * Used for:
 *  - Internal readiness checks before routing traffic
 *  - Ops dashboards / status pages
 *
 * Does NOT expose sensitive details — only pass/fail per dependency.
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

interface DependencyStatus {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}

async function checkSupabase(): Promise<DependencyStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { name: 'supabase', status: 'down', error: 'missing env vars' };
  }

  const start = Date.now();
  try {
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Lightweight probe: single row from a small table
    const { error } = await client.from('profiles').select('id').limit(1);
    const latencyMs = Date.now() - start;
    if (error) return { name: 'supabase', status: 'degraded', latencyMs, error: error.message };
    return { name: 'supabase', status: 'ok', latencyMs };
  } catch (err: unknown) {
    return {
      name: 'supabase',
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

export async function GET() {
  const [supabase] = await Promise.all([checkSupabase()]);

  const dependencies: DependencyStatus[] = [supabase];
  const allOk = dependencies.every((d) => d.status === 'ok');
  const anyDown = dependencies.some((d) => d.status === 'down');

  const overallStatus = allOk ? 'ok' : anyDown ? 'down' : 'degraded';
  const httpStatus = allOk ? 200 : anyDown ? 503 : 207;

  return Response.json(
    {
      status: overallStatus,
      service: 'founder-control-room',
      timestamp: new Date().toISOString(),
      dependencies,
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store',
        'X-Health-Check': 'readiness',
      },
    }
  );
}
