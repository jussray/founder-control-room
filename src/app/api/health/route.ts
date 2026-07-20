/**
 * GET /api/health
 * Lightweight liveness probe — no DB/external calls.
 * Used by:
 *  - deploy.yml smoke test
 *  - Cloudflare health checks
 *  - Uptime monitors
 *
 * Returns 200 immediately if the Worker/Edge runtime is alive.
 */
export const runtime = 'edge';

export async function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'founder-control-room',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Health-Check': 'liveness',
      },
    }
  );
}
