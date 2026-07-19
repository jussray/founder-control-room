import { NextRequest, NextResponse } from 'next/server';
import { missionRequestSchema } from '@/lib/contracts';

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parsed = missionRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_mission_request', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    missionDraft: {
      id: crypto.randomUUID(),
      status: 'draft',
      createdAt: new Date().toISOString(),
      ...parsed.data
    }
  });
}
