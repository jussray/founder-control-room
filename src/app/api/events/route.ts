import { NextRequest, NextResponse } from 'next/server';
import { eventEnvelopeSchema } from '@/lib/contracts';

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parsed = eventEnvelopeSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_event_envelope', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    accepted: true,
    normalizedEvent: {
      ...parsed.data,
      observedAt: parsed.data.observedAt ?? new Date().toISOString()
    }
  });
}
