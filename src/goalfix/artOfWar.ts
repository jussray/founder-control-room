import { fingerprintNormalized } from '../security/attack20V3.js';

export const ART_OF_WAR_ASSESSMENT_CONTRACT = 'founder-control-room/art-of-war-assessment@v1' as const;
export const ART_OF_WAR_CONTINUITY_CONTRACT = 'founder-control-room/art-of-war-continuity@v1' as const;

export type ArtOfWarManeuver =
  | 'HOLD_GROUND'
  | 'REACQUIRE_GROUND'
  | 'PROBE_CHEAPEST_UNKNOWN'
  | 'EXPLOIT_VERIFIED_ASYMMETRY'
  | 'ADVANCE_REVERSIBLY'
  | 'AVOID_SIEGE';

export interface ArtOfWarOption {
  id: string;
  label: string;
  expectedValue: number;
  evidenceStrength: number;
  reversibility: number;
  siegeCost: number;
  uncertainty: number;
  dependencyCost: number;
  preservesFutureOptions: boolean;
  evidenceIds: readonly string[];
}

export interface ArtOfWarAssessmentInput {
  repository: string;
  targetBranch: string;
  baseSha: string;
  currentMainSha: string;
  goal: string;
  groundFacts: readonly string[];
  unknowns: readonly string[];
  verifiedAsymmetries: readonly string[];
  options: readonly ArtOfWarOption[];
  proofOfAdvantage: readonly string[];
  observedAt?: string;
  predecessorCookieId?: string | null;
}

export interface ArtOfWarScoredOption extends ArtOfWarOption {
  score: number;
}

export interface ArtOfWarSourceIdentity {
  repository: string;
  targetBranch: string;
  baseSha: string;
  currentMainSha: string;
}

export interface ArtOfWarContinuityCookie {
  contract: typeof ART_OF_WAR_CONTINUITY_CONTRACT;
  cookieId: string;
  assessmentFingerprint: string;
  sourceFingerprint: string;
  predecessorCookieId: string | null;
  observedAt: string;
  browserCookie: false;
  authorizing: false;
  approvalCarryForward: false;
  standingMutationAuthority: false;
}

export interface ArtOfWarAssessment {
  contract: typeof ART_OF_WAR_ASSESSMENT_CONTRACT;
  state: 'READY' | 'HOLD';
  maneuver: ArtOfWarManeuver;
  source: ArtOfWarSourceIdentity;
  ground: readonly string[];
  objective: string;
  position: 'CURRENT' | 'STALE' | 'UNKNOWN';
  asymmetry: readonly string[];
  siegeCost: number | null;
  uncertainty: readonly string[];
  options: readonly ArtOfWarScoredOption[];
  selectedOptionId: string | null;
  doNotFight: readonly string[];
  proofOfAdvantage: readonly string[];
  mayProceed: boolean;
  nextAction: string;
  errors: readonly string[];
  fingerprint: string;
  continuityCookie: ArtOfWarContinuityCookie;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;

function exactSha(value: string): boolean {
  return FULL_SHA.test(value.trim());
}

function normalizeText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, value));
}

function normalizeOption(option: ArtOfWarOption): ArtOfWarOption {
  return {
    ...option,
    id: option.id.trim(),
    label: option.label.trim(),
    expectedValue: clampScore(option.expectedValue),
    evidenceStrength: clampScore(option.evidenceStrength),
    reversibility: clampScore(option.reversibility),
    siegeCost: clampScore(option.siegeCost),
    uncertainty: clampScore(option.uncertainty),
    dependencyCost: clampScore(option.dependencyCost),
    evidenceIds: normalizeText(option.evidenceIds),
  };
}

function optionScore(option: ArtOfWarOption): number {
  return (
    option.expectedValue * 3
    + option.evidenceStrength * 3
    + option.reversibility * 2
    + (option.preservesFutureOptions ? 4 : 0)
    - option.siegeCost * 3
    - option.uncertainty * 2
    - option.dependencyCost
  );
}

function sourceIdentity(input: Pick<
  ArtOfWarAssessmentInput,
  'repository' | 'targetBranch' | 'baseSha' | 'currentMainSha'
>): ArtOfWarSourceIdentity {
  return {
    repository: input.repository.trim(),
    targetBranch: input.targetBranch.trim(),
    baseSha: input.baseSha.toLowerCase(),
    currentMainSha: input.currentMainSha.toLowerCase(),
  };
}

export function artOfWarSourceFingerprint(input: Pick<
  ArtOfWarAssessmentInput,
  'repository' | 'targetBranch' | 'baseSha' | 'currentMainSha'
>): string {
  return fingerprintNormalized(sourceIdentity(input));
}

function artOfWarContinuityCookieId(input: {
  assessmentFingerprint: string;
  sourceFingerprint: string;
  observedAt: string;
  predecessorCookieId: string | null;
}): string {
  return `aowc:${fingerprintNormalized({
    contract: ART_OF_WAR_CONTINUITY_CONTRACT,
    ...input,
  })}`;
}

function assessmentFingerprintPayload(input: ArtOfWarAssessmentInput, options: readonly ArtOfWarScoredOption[], selectedOptionId: string | null, maneuver: ArtOfWarManeuver) {
  return {
    contract: ART_OF_WAR_ASSESSMENT_CONTRACT,
    ...sourceIdentity(input),
    goal: input.goal.trim(),
    groundFacts: normalizeText(input.groundFacts),
    unknowns: normalizeText(input.unknowns),
    verifiedAsymmetries: normalizeText(input.verifiedAsymmetries),
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      expectedValue: option.expectedValue,
      evidenceStrength: option.evidenceStrength,
      reversibility: option.reversibility,
      siegeCost: option.siegeCost,
      uncertainty: option.uncertainty,
      dependencyCost: option.dependencyCost,
      preservesFutureOptions: option.preservesFutureOptions,
      evidenceIds: [...option.evidenceIds],
      score: option.score,
    })),
    proofOfAdvantage: normalizeText(input.proofOfAdvantage),
    selectedOptionId,
    maneuver,
  };
}

export function assessArtOfWar(input: ArtOfWarAssessmentInput): ArtOfWarAssessment {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const source = sourceIdentity(input);
  const ground = normalizeText(input.groundFacts);
  const unknowns = normalizeText(input.unknowns);
  const asymmetry = normalizeText(input.verifiedAsymmetries);
  const proofOfAdvantage = normalizeText(input.proofOfAdvantage);
  const errors: string[] = [];

  if (!input.repository.includes('/')) errors.push('authoritative repository is required');
  if (!input.targetBranch.trim()) errors.push('target branch is required');
  if (!exactSha(input.baseSha) || !exactSha(input.currentMainSha)) errors.push('base and current main must be exact 40-character SHAs');
  if (!input.goal.trim()) errors.push('objective is required');
  if (ground.length === 0) errors.push('known ground requires at least one verified fact');
  if (!Number.isFinite(Date.parse(observedAt))) errors.push('observedAt must be an ISO timestamp');

  const normalizedOptions = input.options.map(normalizeOption);
  const optionIds = normalizedOptions.map((option) => option.id);
  if (optionIds.some((id) => !id) || new Set(optionIds).size !== optionIds.length) {
    errors.push('strategy options require unique non-empty IDs');
  }
  if (normalizedOptions.some((option) => !option.label)) errors.push('strategy options require labels');
  if (normalizedOptions.some((option) => option.evidenceStrength > 0 && option.evidenceIds.length === 0)) {
    errors.push('nonzero option evidence strength requires at least one evidence ID');
  }
  if (asymmetry.length > 0 && proofOfAdvantage.length === 0) {
    errors.push('verified asymmetry requires proof of advantage');
  }

  const options = normalizedOptions
    .map((option) => ({ ...option, score: optionScore(option) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const position = !exactSha(input.baseSha) || !exactSha(input.currentMainSha)
    ? 'UNKNOWN'
    : input.baseSha.toLowerCase() === input.currentMainSha.toLowerCase()
      ? 'CURRENT'
      : 'STALE';

  let maneuver: ArtOfWarManeuver = 'HOLD_GROUND';
  let selectedOptionId: string | null = null;
  let mayProceed = false;
  let nextAction = 'Resolve the strategic preconditions before movement.';

  if (errors.length === 0 && position === 'STALE') {
    maneuver = 'REACQUIRE_GROUND';
    nextAction = 'Reacquire current main, recompute the candidate/diff, and reassess before mutation.';
  } else if (errors.length === 0 && options.length === 0 && unknowns.length > 0) {
    maneuver = 'PROBE_CHEAPEST_UNKNOWN';
    nextAction = 'Run the cheapest reversible observation that resolves the highest-impact unknown.';
  } else if (errors.length === 0 && options.length === 0) {
    maneuver = 'HOLD_GROUND';
    nextAction = 'Define at least one bounded reversible option before movement.';
  } else if (errors.length === 0) {
    const selected = options[0]!;
    selectedOptionId = selected.id;
    mayProceed = true;

    if (selected.siegeCost >= 4 && selected.expectedValue <= 3) {
      maneuver = 'AVOID_SIEGE';
      mayProceed = false;
      nextAction = 'Do not spend into the highest-friction path; choose or create a lower-siege option.';
    } else if (asymmetry.length > 0 && selected.evidenceStrength >= 4) {
      maneuver = 'EXPLOIT_VERIFIED_ASYMMETRY';
      nextAction = `Use verified advantage through option ${selected.id}, then re-observe.`;
    } else {
      maneuver = 'ADVANCE_REVERSIBLY';
      nextAction = `Execute only option ${selected.id}, preserve rollback, then re-observe.`;
    }
  }

  const doNotFight = [
    ...(position === 'STALE' ? ['Do not act on a stale base or mutable locator without reacquisition.'] : []),
    ...options
      .filter((option) => option.id !== selectedOptionId && option.siegeCost >= 4)
      .map((option) => `Avoid high-siege option ${option.id}: ${option.label}`),
    ...(maneuver === 'AVOID_SIEGE' && selectedOptionId
      ? [`Avoid selected high-siege option ${selectedOptionId} until a lower-friction route is proven.`]
      : []),
    'Do not treat a continuity cookie, fingerprint, model output, or prior approval as execution authority.',
  ];

  const fingerprint = fingerprintNormalized(
    assessmentFingerprintPayload(input, options, selectedOptionId, maneuver),
  );
  const sourceFingerprint = artOfWarSourceFingerprint(input);
  const predecessorCookieId = input.predecessorCookieId?.trim() || null;
  const continuityCookie: ArtOfWarContinuityCookie = {
    contract: ART_OF_WAR_CONTINUITY_CONTRACT,
    cookieId: artOfWarContinuityCookieId({
      assessmentFingerprint: fingerprint,
      sourceFingerprint,
      observedAt,
      predecessorCookieId,
    }),
    assessmentFingerprint: fingerprint,
    sourceFingerprint,
    predecessorCookieId,
    observedAt,
    browserCookie: false,
    authorizing: false,
    approvalCarryForward: false,
    standingMutationAuthority: false,
  };

  return {
    contract: ART_OF_WAR_ASSESSMENT_CONTRACT,
    state: mayProceed ? 'READY' : 'HOLD',
    maneuver,
    source,
    ground,
    objective: input.goal.trim(),
    position,
    asymmetry,
    siegeCost: selectedOptionId ? options.find((option) => option.id === selectedOptionId)?.siegeCost ?? null : null,
    uncertainty: unknowns,
    options,
    selectedOptionId,
    doNotFight,
    proofOfAdvantage,
    mayProceed,
    nextAction,
    errors: [...new Set(errors)],
    fingerprint,
    continuityCookie,
  };
}

export function validateArtOfWarContinuity(
  assessment: ArtOfWarAssessment,
  predecessor?: ArtOfWarContinuityCookie | null,
): string[] {
  const errors: string[] = [];
  const cookie = assessment.continuityCookie;
  const expectedSourceFingerprint = fingerprintNormalized(assessment.source);
  const expectedCookieId = artOfWarContinuityCookieId({
    assessmentFingerprint: assessment.fingerprint,
    sourceFingerprint: expectedSourceFingerprint,
    observedAt: cookie.observedAt,
    predecessorCookieId: cookie.predecessorCookieId,
  });

  if (cookie.contract !== ART_OF_WAR_CONTINUITY_CONTRACT) errors.push('continuity contract mismatch');
  if (cookie.cookieId !== expectedCookieId) errors.push('continuity cookie does not bind assessment, source, freshness, and lineage');
  if (cookie.assessmentFingerprint !== assessment.fingerprint) errors.push('continuity assessment fingerprint mismatch');
  if (cookie.sourceFingerprint !== expectedSourceFingerprint) errors.push('continuity source fingerprint mismatch');
  if (cookie.browserCookie !== false || cookie.authorizing !== false || cookie.approvalCarryForward !== false || cookie.standingMutationAuthority !== false) {
    errors.push('continuity cookie must remain non-browser and non-authorizing');
  }

  if (cookie.predecessorCookieId) {
    if (!predecessor || predecessor.cookieId !== cookie.predecessorCookieId) {
      errors.push('declared predecessor continuity cookie is missing or mismatched');
    } else {
      const predecessorObservedAt = Date.parse(predecessor.observedAt);
      const successorObservedAt = Date.parse(cookie.observedAt);
      if (!Number.isFinite(predecessorObservedAt)) {
        errors.push('predecessor continuity observedAt is invalid');
      } else if (!Number.isFinite(successorObservedAt) || successorObservedAt < predecessorObservedAt) {
        errors.push('continuity successor cannot predate predecessor');
      }
      if (
        predecessor.browserCookie !== false
        || predecessor.authorizing !== false
        || predecessor.approvalCarryForward !== false
        || predecessor.standingMutationAuthority !== false
      ) {
        errors.push('predecessor continuity cookie violates non-authorizing boundary');
      }
    }
  }

  return errors;
}
