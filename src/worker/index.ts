// Cloudflare Worker — lightweight edge relay and health check
// Keep thin: validate, relay to Control Room API or Supabase, return fast.
// Business logic belongs in the Next.js API routes, not here.

export interface Env {
  ENVIRONMENT: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, env: env.ENVIRONMENT, ts: Date.now() });
    }

    return new Response('Not found', { status: 404 });
  }
};
