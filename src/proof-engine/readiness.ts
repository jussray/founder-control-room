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
  const boundedSignals = signals.map((signal) => ({
    ...signal,
    evidence: signal.evidence.filter(Boolean).slice(0, 20),
  }));
  const score = boundedSignals.length === 0
    ? 0
    : Math.round(
        (boundedSignals.reduce((sum, signal) => sum + WEIGHT[signal.status], 0) /
          boundedSignals.length) *
          100,
      );
  const blockers = boundedSignals
    .filter((signal) => signal.status === 'blocked')
    .map((signal) => `${signal.provider}: ${signal.label}`);
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
