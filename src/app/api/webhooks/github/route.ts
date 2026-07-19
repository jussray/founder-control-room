import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { enqueueEvent } from '@/lib/queries';

function laneFromRepo(repo: string): string {
  const r = repo.toLowerCase();
  if (r.includes('sekret') || r.includes('bip')) return 'sekret-bip';
  if (r.includes('founder') || r.includes('control')) return 'founder-os';
  return 'partner-project';
}

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  const event = req.headers.get('x-github-event') ?? 'unknown';

  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw); } catch { /* malformed body */ }

  const repo = (payload?.repository as { name?: string })?.name ?? 'unknown';
  const lane_id = laneFromRepo(repo);

  await enqueueEvent({ source: 'github', lane_id, event_type: event, payload });

  return NextResponse.json({ ok: true, lane_id, event_type: event });
}
