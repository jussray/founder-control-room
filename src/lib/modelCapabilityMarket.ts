import {
  agentCanOperate,
  type AgentOperatorCapability,
} from './agentRegistry.js';

export type CapabilityTaskClass =
  | 'repository-repair'
  | 'architecture-review'
  | 'business-workflow'
  | 'scientific-research'
  | 'public-research'
  | 'cross-provider-drift'
  | 'browser-runtime'
  | 'founder-synthesis';

export interface CapabilityCandidate {
  operatorId: string;
  providerFamily: string;
  taskClasses: readonly CapabilityTaskClass[];
  capability: AgentOperatorCapability;
}

export interface CapabilityObservation {
  operatorId: string;
  taskClass: CapabilityTaskClass;
  observedAt: string;
  sampleSize: number;
  successRate: number;
  proofRate: number;
  falseGreenRate: number;
  authorityViolationRate: number;
  rootCauseAccuracy?: number;
  medianCostUsd?: number;
  medianDurationMs?: number;
  evidenceRefs: readonly string[];
}

export interface ExternalBenchmarkPrior {
  operatorId: string;
  taskClass: CapabilityTaskClass;
  observedAt: string;
  score: number;
  sourceRef: string;
}

export interface CapabilityMarketOptions {
  now?: Date;
  maxObservationAgeMs?: number;
  maxBenchmarkAgeMs?: number;
  minLocalSamples?: number;
  benchmarkPriorWeight?: number;
  costReferenceUsd?: number;
  durationReferenceMs?: number;
}

export type CapabilityMarketStatus = 'eligible' | 'trial' | 'blocked';

export interface RankedCapabilityCandidate {
  operatorId: string;
  providerFamily: string;
  taskClass: CapabilityTaskClass;
  capability: AgentOperatorCapability;
  status: CapabilityMarketStatus;
  score: number;
  localSamples: number;
  localEvidenceRefs: readonly string[];
  benchmarkRefs: readonly string[];
  reasons: readonly string[];
  selectionAuthority: false;
  executionAuthority: false;
}

export interface CapabilityRoute {
  taskClass: CapabilityTaskClass;
  primary: RankedCapabilityCandidate | null;
  challenger: RankedCapabilityCandidate | null;
  shadowTrials: readonly RankedCapabilityCandidate[];
  selectionAuthority: false;
  executionAuthority: false;
}

const DEFAULT_OBSERVATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_BENCHMARK_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isFresh(observedAt: string, now: Date, maxAgeMs: number): boolean {
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= 0 && age <= maxAgeMs;
}

function weightedMean(
  observations: readonly CapabilityObservation[],
  selector: (observation: CapabilityObservation) => number,
): number {
  const denominator = observations.reduce((sum, observation) => sum + observation.sampleSize, 0);
  if (denominator <= 0) return 0;

  const numerator = observations.reduce(
    (sum, observation) => sum + clamp01(selector(observation)) * observation.sampleSize,
    0,
  );

  return numerator / denominator;
}

function efficiencyScore(value: number | undefined, reference: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 0.5;
  if (!Number.isFinite(reference) || reference <= 0) return 0.5;
  return clamp01(reference / Math.max(value, reference * 0.05));
}

function localOutcomeScore(
  observations: readonly CapabilityObservation[],
  costReferenceUsd: number,
  durationReferenceMs: number,
): number {
  const success = weightedMean(observations, (observation) => observation.successRate);
  const proof = weightedMean(observations, (observation) => observation.proofRate);
  const rootCause = weightedMean(
    observations,
    (observation) => observation.rootCauseAccuracy ?? observation.successRate,
  );
  const falseGreenSafety = 1 - weightedMean(observations, (observation) => observation.falseGreenRate);

  const sampleWeight = observations.reduce((sum, observation) => sum + observation.sampleSize, 0);
  const medianCost = observations.reduce(
    (sum, observation) => sum + (observation.medianCostUsd ?? costReferenceUsd) * observation.sampleSize,
    0,
  ) / sampleWeight;
  const medianDuration = observations.reduce(
    (sum, observation) => sum + (observation.medianDurationMs ?? durationReferenceMs) * observation.sampleSize,
    0,
  ) / sampleWeight;

  const correctness = (
    success * 0.35
    + proof * 0.25
    + rootCause * 0.2
    + falseGreenSafety * 0.2
  );

  const economics = (
    efficiencyScore(medianCost, costReferenceUsd) * 0.5
    + efficiencyScore(medianDuration, durationReferenceMs) * 0.5
  );

  return clamp01(correctness * 0.9 + economics * 0.1) * 100;
}

function benchmarkScore(
  priors: readonly ExternalBenchmarkPrior[],
  operatorId: string,
): { score: number | null; refs: string[] } {
  const matching = priors.filter((prior) => prior.operatorId === operatorId);
  if (matching.length === 0) return { score: null, refs: [] };

  const score = matching.reduce((sum, prior) => sum + clamp01(prior.score), 0) / matching.length;
  return {
    score: score * 100,
    refs: matching.map((prior) => prior.sourceRef),
  };
}

export function rankCapabilityCandidates(input: {
  taskClass: CapabilityTaskClass;
  candidates: readonly CapabilityCandidate[];
  observations: readonly CapabilityObservation[];
  benchmarkPriors?: readonly ExternalBenchmarkPrior[];
  options?: CapabilityMarketOptions;
}): RankedCapabilityCandidate[] {
  const now = input.options?.now ?? new Date();
  const maxObservationAgeMs = input.options?.maxObservationAgeMs ?? DEFAULT_OBSERVATION_AGE_MS;
  const maxBenchmarkAgeMs = input.options?.maxBenchmarkAgeMs ?? DEFAULT_BENCHMARK_AGE_MS;
  const minLocalSamples = input.options?.minLocalSamples ?? 3;
  const benchmarkPriorWeight = clamp01(input.options?.benchmarkPriorWeight ?? 0.1);
  const costReferenceUsd = input.options?.costReferenceUsd ?? 1;
  const durationReferenceMs = input.options?.durationReferenceMs ?? 60_000;

  const freshPriors = (input.benchmarkPriors ?? []).filter(
    (prior) => prior.taskClass === input.taskClass
      && Boolean(prior.sourceRef.trim())
      && isFresh(prior.observedAt, now, maxBenchmarkAgeMs),
  );

  return input.candidates
    .filter((candidate) => candidate.taskClasses.includes(input.taskClass))
    .map((candidate): RankedCapabilityCandidate => {
      const reasons: string[] = [];
      const local = input.observations.filter(
        (observation) => observation.operatorId === candidate.operatorId
          && observation.taskClass === input.taskClass
          && observation.sampleSize > 0
          && observation.evidenceRefs.length > 0
          && isFresh(observation.observedAt, now, maxObservationAgeMs),
      );
      const localSamples = local.reduce((sum, observation) => sum + observation.sampleSize, 0);
      const benchmark = benchmarkScore(freshPriors, candidate.operatorId);
      const canOperate = agentCanOperate(candidate.operatorId, candidate.capability);
      const hasAuthorityViolation = local.some((observation) => observation.authorityViolationRate > 0);

      let status: CapabilityMarketStatus;
      let score = 0;

      if (!canOperate) {
        status = 'blocked';
        reasons.push('operator is not enabled for the requested capability');
      } else if (hasAuthorityViolation) {
        status = 'blocked';
        reasons.push('fresh local evidence contains an authority-boundary violation');
      } else if (localSamples < minLocalSamples) {
        status = 'trial';
        reasons.push('insufficient fresh local samples for primary routing');
        score = benchmark.score === null ? 0 : benchmark.score * benchmarkPriorWeight;
      } else {
        status = 'eligible';
        const localScore = localOutcomeScore(local, costReferenceUsd, durationReferenceMs);
        score = benchmark.score === null
          ? localScore
          : localScore * (1 - benchmarkPriorWeight) + benchmark.score * benchmarkPriorWeight;
        reasons.push('fresh task-specific outcome evidence satisfies the local sample gate');
      }

      if (benchmark.score !== null) {
        reasons.push('external benchmark is treated only as a bounded prior, never outcome proof');
      }

      return {
        operatorId: candidate.operatorId,
        providerFamily: candidate.providerFamily,
        taskClass: input.taskClass,
        capability: candidate.capability,
        status,
        score: Number(score.toFixed(3)),
        localSamples,
        localEvidenceRefs: [...new Set(local.flatMap((observation) => observation.evidenceRefs))],
        benchmarkRefs: [...new Set(benchmark.refs)],
        reasons,
        selectionAuthority: false,
        executionAuthority: false,
      };
    })
    .sort((left, right) => {
      const statusOrder: Record<CapabilityMarketStatus, number> = {
        eligible: 0,
        trial: 1,
        blocked: 2,
      };
      return statusOrder[left.status] - statusOrder[right.status]
        || right.score - left.score
        || right.localSamples - left.localSamples
        || left.operatorId.localeCompare(right.operatorId);
    });
}

export function buildCapabilityRoute(input: {
  taskClass: CapabilityTaskClass;
  candidates: readonly CapabilityCandidate[];
  observations: readonly CapabilityObservation[];
  benchmarkPriors?: readonly ExternalBenchmarkPrior[];
  options?: CapabilityMarketOptions;
}): CapabilityRoute {
  const ranked = rankCapabilityCandidates(input);
  const eligible = ranked.filter((candidate) => candidate.status === 'eligible');
  const primary = eligible[0] ?? null;
  const challenger = primary
    ? ranked.find(
      (candidate) => candidate.status !== 'blocked'
        && candidate.operatorId !== primary.operatorId
        && candidate.providerFamily !== primary.providerFamily,
    ) ?? null
    : null;

  const shadowTrials = ranked.filter(
    (candidate) => candidate.status === 'trial'
      && candidate.operatorId !== challenger?.operatorId,
  );

  return {
    taskClass: input.taskClass,
    primary,
    challenger,
    shadowTrials,
    selectionAuthority: false,
    executionAuthority: false,
  };
}
