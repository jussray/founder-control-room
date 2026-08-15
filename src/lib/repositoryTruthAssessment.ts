export type RepositoryTruthState = "verified" | "attention" | "stale" | "unknown";
export type RepositoryTruthFreshness = "fresh" | "stale" | "missing" | "invalid";
export type RepositoryTruthRecommendation = "hold" | "review" | "candidate-promote";

export interface RepositoryTruthRun {
  overall_status: string;
  signature_verified: boolean;
  received_at: string;
  scanned_at?: string | null;
}

export interface RepositoryTruthFindingSummary {
  total: number;
  critical: number;
  high: number;
}

export interface RepositoryTruthCapabilitySummary {
  total: number;
  verified: number;
  drifted: number;
  unverified: number;
  failedUsageAssertions: number;
}

export interface RepositoryTruthAssessmentInput {
  latestRun: RepositoryTruthRun | null;
  verificationCadenceMinutes: number;
  findings: RepositoryTruthFindingSummary;
  capabilities: RepositoryTruthCapabilitySummary;
  openMissionCount: number;
  now?: Date;
}

export interface RepositoryTruthAssessment {
  state: RepositoryTruthState;
  freshness: RepositoryTruthFreshness;
  recommendation: RepositoryTruthRecommendation;
  confidence: number;
  evidenceCompleteness: number;
  ageMinutes: number | null;
  staleAfterMinutes: number;
  freshUntil: string | null;
  founderReviewRequired: true;
  promotionAllowed: false;
  mutationAuthorized: false;
  blocker: string | null;
  nextAction: string;
  reasons: string[];
}

const MIN_STALE_WINDOW_MINUTES = 15;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function nonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function evidenceCompleteness(
  run: RepositoryTruthRun,
  findings: RepositoryTruthFindingSummary,
  capabilities: RepositoryTruthCapabilitySummary,
): number {
  let score = 0;

  if (run.signature_verified) score += 25;
  if (["passed", "warning", "failed"].includes(run.overall_status)) score += 20;

  if (capabilities.total > 0) {
    score += 25 * (nonNegativeInt(capabilities.verified) / nonNegativeInt(capabilities.total));
  }

  if (nonNegativeInt(capabilities.failedUsageAssertions) === 0) score += 10;
  if (nonNegativeInt(findings.critical) === 0 && nonNegativeInt(findings.high) === 0) score += 20;

  return clampPercent(score);
}

export function assessRepositoryTruth(
  input: RepositoryTruthAssessmentInput,
): RepositoryTruthAssessment {
  const cadenceMinutes = Math.max(1, nonNegativeInt(input.verificationCadenceMinutes) || 15);
  const staleAfterMinutes = Math.max(MIN_STALE_WINDOW_MINUTES, cadenceMinutes * 2);
  const now = input.now ?? new Date();
  const run = input.latestRun;

  const base = {
    staleAfterMinutes,
    founderReviewRequired: true as const,
    promotionAllowed: false as const,
    mutationAuthorized: false as const,
  };

  if (!run) {
    return {
      ...base,
      state: "unknown",
      freshness: "missing",
      recommendation: "hold",
      confidence: 0,
      evidenceCompleteness: 0,
      ageMinutes: null,
      freshUntil: null,
      blocker: "No repository verification receipt exists.",
      nextAction: "Verify now before making a repository health claim.",
      reasons: ["No exact-repository evidence has been recorded."],
    };
  }

  const receivedAtMs = Date.parse(run.received_at);
  if (!Number.isFinite(receivedAtMs) || receivedAtMs > now.getTime() + MAX_FUTURE_SKEW_MS) {
    return {
      ...base,
      state: "unknown",
      freshness: "invalid",
      recommendation: "hold",
      confidence: 0,
      evidenceCompleteness: 0,
      ageMinutes: null,
      freshUntil: null,
      blocker: "The latest receipt has an invalid observation time.",
      nextAction: "Re-run verification and replace the invalid receipt.",
      reasons: ["Receipt time cannot establish evidence freshness."],
    };
  }

  const ageMinutes = Math.max(0, Math.floor((now.getTime() - receivedAtMs) / 60_000));
  const freshUntil = new Date(receivedAtMs + staleAfterMinutes * 60_000).toISOString();
  const completeness = evidenceCompleteness(run, input.findings, input.capabilities);
  const isStale = ageMinutes > staleAfterMinutes;

  if (isStale) {
    return {
      ...base,
      state: "stale",
      freshness: "stale",
      recommendation: "hold",
      confidence: Math.min(40, completeness),
      evidenceCompleteness: completeness,
      ageMinutes,
      freshUntil,
      blocker: `Evidence is ${ageMinutes} minutes old and exceeds the ${staleAfterMinutes}-minute freshness window.`,
      nextAction: "Verify now. Do not reuse the previous green or red claim.",
      reasons: ["Stale evidence cannot authorize a current-state claim."],
    };
  }

  const reasons: string[] = [];
  const highRiskFindings = nonNegativeInt(input.findings.critical) + nonNegativeInt(input.findings.high);
  const capabilityDrift = nonNegativeInt(input.capabilities.drifted)
    + nonNegativeInt(input.capabilities.unverified)
    + nonNegativeInt(input.capabilities.failedUsageAssertions);
  const runNeedsAttention = run.overall_status !== "passed";
  const unsigned = !run.signature_verified;

  if (runNeedsAttention) reasons.push(`Latest repository run is ${run.overall_status || "unverified"}.`);
  if (highRiskFindings > 0) reasons.push(`${highRiskFindings} high-risk or critical finding(s) remain open.`);
  if (capabilityDrift > 0) reasons.push(`${capabilityDrift} capability or usage assertion(s) are not verified.`);
  if (unsigned) reasons.push("Latest evidence is not signature-verified.");

  if (runNeedsAttention || highRiskFindings > 0 || capabilityDrift > 0 || unsigned) {
    return {
      ...base,
      state: "attention",
      freshness: "fresh",
      recommendation: "review",
      confidence: Math.min(unsigned ? 60 : 70, completeness),
      evidenceCompleteness: completeness,
      ageMinutes,
      freshUntil,
      blocker: reasons[0] ?? "Repository evidence requires founder review.",
      nextAction: input.openMissionCount > 0
        ? "Review the active bounded repair mission and its exact-head proof."
        : "Prepare one bounded repair mission for the highest-leverage verified blocker.",
      reasons,
    };
  }

  const candidate = completeness >= 80;
  return {
    ...base,
    state: "verified",
    freshness: "fresh",
    recommendation: candidate ? "candidate-promote" : "hold",
    confidence: Math.min(90, completeness),
    evidenceCompleteness: completeness,
    ageMinutes,
    freshUntil,
    blocker: null,
    nextAction: candidate
      ? "Keep observing until the next due verification; any promotion remains founder-gated."
      : "Increase evidence completeness before treating this capability as a promotion candidate.",
    reasons: candidate
      ? ["Fresh signed evidence supports the current repository-health claim."]
      : ["The run passed, but evidence completeness is below the promotion-candidate threshold."],
  };
}
