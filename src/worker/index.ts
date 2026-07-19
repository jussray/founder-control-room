// Cloudflare Worker — edge relay + health
// Thin on purpose: validate signature, relay to origin, return fast.
// All business logic lives in Next.js API routes.

export interface Env {
  ENVIRONMENT: string;
  ORIGIN_URL: string;        // e.g. https://your-app.vercel.app
  GITHUB_WEBHOOK_SECRET: string;
}

async function verifyHmac(body: string, sig: string | null, secret: string): Promise<boolean> {
  if (!sig || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const hex = 'sha256=' + Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time compare
  if (hex.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ─── Health ────────────────────────────────────────────────────────────────
    if (url.pathname === '/health') {
      return Response.json({ ok: true, env: env.ENVIRONMENT, ts: Date.now() });
    }

    // ─── GitHub webhook relay ────────────────────────────────────────────────
    if (url.pathname === '/relay' && request.method === 'POST') {
      const body = await request.text();
      const sig  = request.headers.get('x-hub-signature-256');

      const valid = await verifyHmac(body, sig, env.GITHUB_WEBHOOK_SECRET ?? '');
      if (!valid) {
        return Response.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
      }

      const origin = env.ORIGIN_URL?.replace(/\/$/, '');
      if (!origin) {
        return Response.json({ ok: false, error: 'ORIGIN_URL not configured' }, { status: 500 });
      }

      const forwarded = await fetch(`${origin}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sig ?? '',
          'x-github-event': request.headers.get('x-github-event') ?? 'unknown',
          'x-forwarded-by': 'cf-worker'
        },
        body
      });

      const result = await forwarded.json();
      return Response.json(result, { status: forwarded.status });
    }

    return new Response('Not found', { status: 404 });
  }
};
