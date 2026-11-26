export type ProofStatus = 'verified' | 'warning' | 'blocked' | 'unknown';

export interface ProofSignal {
  id: string;
  provider: 'github' | 'supabase' | 'cloudflare' | 'playwright' | 'legal';
  label: string;
  status: ProofStatus;
  evidence: string[];
  checkedAt: string | null;
}

export interface ProofEngineSnapshot {
  projectSlug: string;
  score: number;
  status: 'ready' | 'conditional' | 'blocked';
  signals: ProofSignal[];
  blockers: string[];
  generatedAt: string;
}

// Match the existing one-hour evidence freshness lease; expiry is fail-closed.
const READINESS_MAX_AGE_MS = 60 * 60 * 1000;

const WEIGHT: Record<ProofStatus, number> = {
  verified: 1,
  warning: 0.5,
  unknown: 0.25,
  blocked: 0,
};

export function buildProofEngineSnapshot(
  projectSlug: string,
  signals: ProofSignal[],
  now = new Date(),
): ProofEngineSnapshot {
  const checkedNow = now.getTime();
  const bounded = signals.map((signal) => {
    const evidence = signal.evidence
      .filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)
      .slice(0, 20);
    let invalidReason: string | null = null;

    // A source-reported "verified" status alone is insufficient to establish freshness.
    if (signal.status === 'verified') {
      const checkedAtMs = signal.checkedAt ? Date.parse(signal.checkedAt) : NaN;
      if (!evidence.length) invalidReason = 'missing evidence';
      else if (!Number.isFinite(checkedAtMs)) invalidReason = 'missing or invalid verification time';
      else if (checkedAtMs > checkedNow) invalidReason = 'future-dated verification';
      else if (checkedNow - checkedAtMs > READINESS_MAX_AGE_MS) invalidReason = 'stale verification';
    }

    return {
      signal: { ...signal, evidence, status: invalidReason ? 'blocked' as const : signal.status },
      invalidReason,
    };
  });
  const boundedSignals = bounded.map((item) => item.signal);
  const score = boundedSignals.length === 0
    ? 0
    : Math.round(
        (boundedSignals.reduce((sum, signal) => sum + WEIGHT[signal.status], 0) /
          boundedSignals.length) *
          100,
      );
  const blockers = bounded
    .filter((item) => item.signal.status === 'blocked')
    .map(({ signal, invalidReason }) => `${signal.provider}: ${signal.label}${invalidReason ? ` (${invalidReason})` : ''}`);
  if (boundedSignals.length === 0) blockers.push('proof-engine: no proof signals observed');
  const status = blockers.length > 0 ? 'blocked' : score === 100 ? 'ready' : 'conditional';

  return {
    projectSlug,
    score,
    status,
    signals: boundedSignals,
    blockers,
    generatedAt: now.toISOString(),
  };
}
