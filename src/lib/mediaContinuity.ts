import { createHash } from 'node:crypto';
import {
  createOperatorContinuityReceiptV2,
  evaluateOperatorContinuityReceiptV2,
  operatorContinuityDimensionFingerprint,
  validateOperatorContinuityReceiptV2,
  type OperatorContinuityEvaluationV2,
  type OperatorContinuityInputV2,
  type OperatorContinuityReceiptV2,
  type OperatorContinuitySourceV2,
} from './operatorContinuity.js';

export const MEDIA_CONTINUITY_CONTRACT = 'founder-control-room/media-continuity@v1' as const;

export const MEDIA_EVIDENCE_STATES = [
  'script_verified',
  'shot_generated',
  'edit_verified',
  'export_verified',
] as const;

export type MediaEvidenceState = (typeof MEDIA_EVIDENCE_STATES)[number];

export interface MediaContinuityInput {
  source: OperatorContinuitySourceV2;
  projectSlug: string;
  repositoryFullName: string;
  targetBranch: string;
  targetSha: string;
  missionId: string;
  intentFingerprint: string;
  subjectFingerprint: string;
  scriptFingerprint: string;
  promptFingerprint: string;
  sourceAssetFingerprints: readonly string[];
  intelligenceFingerprint: string;
  renderStackFingerprint: string;
  runtimeFingerprint: string;
  outputFingerprint: string | null;
  reviewFingerprint?: string | null;
  authorityFingerprint?: string | null;
  evidenceState: MediaEvidenceState;
  evidenceRefs: readonly string[];
  observedAt: string;
  expiresAt: string;
  predecessorFingerprint?: string | null;
}

export interface MediaProofCookie {
  contract: typeof MEDIA_CONTINUITY_CONTRACT;
  cookieId: string;
  kind: 'proof-cookie';
  missionId: string;
  evidenceState: MediaEvidenceState;
  outputFingerprint: string | null;
  continuity: OperatorContinuityReceiptV2;
  browserCookie: false;
  actionAuthority: false;
  publishAuthority: false;
  credentialsEmbedded: false;
}

export interface MediaProofCookieEvaluation extends OperatorContinuityEvaluationV2 {
  cookieMayAuthorizeAction: false;
  cookieMayAuthorizePublish: false;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedFingerprints(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => text(value).toLowerCase()).filter(Boolean))].sort();
}

/** Hash media identity without retaining raw prompt/script/source content in the receipt. */
export function mediaContinuityDigest(value: unknown): string {
  return operatorContinuityDimensionFingerprint(value);
}

function mediaContinuityInputErrors(input: MediaContinuityInput): string[] {
  const errors: string[] = [];
  const requiredFingerprints: Array<[string, string]> = [
    ['intentFingerprint', input.intentFingerprint],
    ['subjectFingerprint', input.subjectFingerprint],
    ['scriptFingerprint', input.scriptFingerprint],
    ['promptFingerprint', input.promptFingerprint],
    ['intelligenceFingerprint', input.intelligenceFingerprint],
    ['renderStackFingerprint', input.renderStackFingerprint],
    ['runtimeFingerprint', input.runtimeFingerprint],
  ];

  if (!UUID.test(text(input.missionId))) {
    errors.push('missionId must be a Mission Engine UUID');
  }
  if (!MEDIA_EVIDENCE_STATES.includes(input.evidenceState)) errors.push('unsupported media evidence state');

  for (const [field, value] of requiredFingerprints) {
    if (!SHA256.test(text(value))) errors.push(`${field} must be a 64-character SHA-256 hash`);
  }

  const optionalFingerprints: Array<[string, string | null | undefined]> = [
    ['outputFingerprint', input.outputFingerprint],
    ['reviewFingerprint', input.reviewFingerprint],
    ['authorityFingerprint', input.authorityFingerprint],
    ['predecessorFingerprint', input.predecessorFingerprint],
  ];
  for (const [field, value] of optionalFingerprints) {
    if (value !== null && value !== undefined && !SHA256.test(text(value))) {
      errors.push(`${field} must be a 64-character SHA-256 hash or null`);
    }
  }

  const assets = normalizedFingerprints(input.sourceAssetFingerprints);
  if (assets.length > 100) errors.push('sourceAssetFingerprints must contain at most 100 entries');
  if (assets.some((value) => !SHA256.test(value))) {
    errors.push('sourceAssetFingerprints must contain only 64-character SHA-256 hashes');
  }

  return [...new Set(errors)];
}

export function mediaContinuityOperatorInput(input: MediaContinuityInput): OperatorContinuityInputV2 {
  const errors = mediaContinuityInputErrors(input);
  if (errors.length > 0) throw new Error(errors.join('; '));

  const sourceAssetFingerprints = normalizedFingerprints(input.sourceAssetFingerprints);
  const scopeFingerprint = mediaContinuityDigest({
    contract: MEDIA_CONTINUITY_CONTRACT,
    missionId: text(input.missionId),
    intentFingerprint: text(input.intentFingerprint).toLowerCase(),
    subjectFingerprint: text(input.subjectFingerprint).toLowerCase(),
    scriptFingerprint: text(input.scriptFingerprint).toLowerCase(),
    promptFingerprint: text(input.promptFingerprint).toLowerCase(),
    sourceAssetFingerprints,
  });
  const proofFingerprint = mediaContinuityDigest({
    contract: MEDIA_CONTINUITY_CONTRACT,
    evidenceState: input.evidenceState,
    outputFingerprint: input.outputFingerprint ? text(input.outputFingerprint).toLowerCase() : null,
  });
  const providerFingerprint = mediaContinuityDigest({
    intelligenceFingerprint: text(input.intelligenceFingerprint).toLowerCase(),
    renderStackFingerprint: text(input.renderStackFingerprint).toLowerCase(),
  });

  return {
    source: input.source,
    projectSlug: input.projectSlug,
    repositoryFullName: input.repositoryFullName,
    targetBranch: input.targetBranch,
    targetSha: input.targetSha,
    prNumber: null,
    baseSha: null,
    headSha: null,
    scopeFingerprint,
    proofFingerprint,
    reviewFingerprint: input.reviewFingerprint ? text(input.reviewFingerprint).toLowerCase() : null,
    providerFingerprint,
    runtimeFingerprint: text(input.runtimeFingerprint).toLowerCase(),
    authorityFingerprint: input.authorityFingerprint ? text(input.authorityFingerprint).toLowerCase() : null,
    evidenceRefs: input.evidenceRefs,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    predecessorFingerprint: input.predecessorFingerprint ? text(input.predecessorFingerprint).toLowerCase() : null,
  };
}

/**
 * Mint a media proof cookie as bounded continuity evidence.
 * This is deliberately not a browser cookie and cannot authorize generation,
 * publishing, deployment, billing, provider mutation, or any other action.
 */
export function createMediaProofCookie(input: MediaContinuityInput): MediaProofCookie {
  const continuity = createOperatorContinuityReceiptV2(mediaContinuityOperatorInput(input));
  return {
    contract: MEDIA_CONTINUITY_CONTRACT,
    cookieId: continuity.fingerprint,
    kind: 'proof-cookie',
    missionId: text(input.missionId),
    evidenceState: input.evidenceState,
    outputFingerprint: input.outputFingerprint ? text(input.outputFingerprint).toLowerCase() : null,
    continuity,
    browserCookie: false,
    actionAuthority: false,
    publishAuthority: false,
    credentialsEmbedded: false,
  };
}

export function validateMediaProofCookie(cookie: MediaProofCookie): string[] {
  const errors = [...validateOperatorContinuityReceiptV2(cookie.continuity)];
  if (cookie.contract !== MEDIA_CONTINUITY_CONTRACT) errors.push('media continuity contract is unsupported');
  if (cookie.cookieId !== cookie.continuity.fingerprint) errors.push('media cookieId must equal the bound continuity fingerprint');
  if (!UUID.test(text(cookie.missionId))) errors.push('media proof cookie missionId must be a Mission Engine UUID');
  if (!MEDIA_EVIDENCE_STATES.includes(cookie.evidenceState)) errors.push('media proof cookie evidence state is unsupported');
  if (cookie.outputFingerprint !== null && !SHA256.test(cookie.outputFingerprint)) errors.push('media proof cookie output fingerprint is malformed');
  if (cookie.browserCookie !== false) errors.push('media proof cookie must never become a browser cookie');
  if (cookie.actionAuthority !== false) errors.push('media proof cookie cannot authorize actions');
  if (cookie.publishAuthority !== false) errors.push('media proof cookie cannot authorize publishing');
  if (cookie.credentialsEmbedded !== false) errors.push('media proof cookie cannot embed credentials');
  return [...new Set(errors)];
}

export function evaluateMediaProofCookie(
  cookie: MediaProofCookie,
  current: MediaContinuityInput,
  now: string,
): MediaProofCookieEvaluation {
  if (validateMediaProofCookie(cookie).length > 0) {
    return {
      state: 'invalid',
      reasons: ['receipt_invalid'],
      reacquireRequired: true,
      continuityMayAuthorizeAction: false,
      cookieMayAuthorizeAction: false,
      cookieMayAuthorizePublish: false,
    };
  }

  if (text(cookie.missionId) !== text(current.missionId)) {
    return {
      state: 'invalid',
      reasons: ['receipt_invalid'],
      reacquireRequired: true,
      continuityMayAuthorizeAction: false,
      cookieMayAuthorizeAction: false,
      cookieMayAuthorizePublish: false,
    };
  }

  const result = evaluateOperatorContinuityReceiptV2(cookie.continuity, mediaContinuityOperatorInput(current), now);
  return {
    ...result,
    cookieMayAuthorizeAction: false,
    cookieMayAuthorizePublish: false,
  };
}

/** A compact public-safe identity for a rendered artifact or receipt. */
export function mediaProofCookieLabel(cookie: MediaProofCookie): string {
  const digest = createHash('sha256').update(`${cookie.contract}:${cookie.cookieId}`).digest('hex').slice(0, 12);
  return `media-proof:${cookie.evidenceState}:${digest}`;
}
