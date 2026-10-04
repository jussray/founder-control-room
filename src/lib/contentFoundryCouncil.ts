export const FCR_CONTENT_FOUNDRY_CONTRACT = 'juss/content-foundry-council@v1' as const;
export const FCR_ASK_ME_VIDEO_COUNCIL_CONTRACT = 'juss/ask-me-video-council@v1' as const;
export const FCR_COUNCIL_CONTINUITY_FINGERPRINT_CONTRACT =
  'juss/council-continuity-fingerprint@v1' as const;
export const FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT =
  'juss/council-continuity-cookie@v1' as const;

export const FCR_CONTENT_FOUNDRY_STAGES = [
  'discover',
  'score',
  'package',
  'script',
  'LEEVIZE',
  'proof-check',
  'publish-package',
  'repurpose',
  'measure',
  'learn',
] as const;

export const FCR_CONTENT_PACKET_FIELDS = [
  'objective',
  'audience',
  'source_material',
  'product_or_project',
  'evidence',
  'brand_canon',
  'platform',
  'monetization_path',
  'constraints',
  'success_metric',
] as const;

export const FCR_COUNCIL_FINGERPRINT_FIELDS = [
  'project',
  'workflow_id',
  'goal',
  'action',
  'packet_version',
  'source_versions',
  'evidence_ids',
  'council_members',
  'model_routing',
  'decision',
] as const;

export const FCR_COUNCIL_CONTINUITY_COOKIE_FIELDS = [
  'cookie_hash',
  'previous_cookie_hash',
  'workflow_fingerprint',
  'project',
  'workflow_id',
  'stage',
  'decision',
  'status',
  'model_routing',
  'evidence_ids',
  'failure_cause',
  'correction',
  'founder_preference',
  'outcome_summary',
  'generated_at',
] as const;

export const FCR_ASK_ME_VIDEO_COUNCIL_RECEIPT_FIELDS = [
  'council_members',
  'member_findings',
  'dissent',
  'reconciled_direction',
  'decision_rationale',
  'workflow_fingerprint',
  'model_routing',
  'continuity_cookies',
  'execution_evidence',
  'outcome_feedback',
] as const;

export const FCR_ASK_ME_VIDEO_COUNCIL_ROLES = {
  'viewer-advocate': {
    northStar: 'The intended viewer understands the promise, payoff, and next action without avoidable confusion.',
  },
  'story-director': {
    northStar: 'Every beat and shot earns its place in one coherent visual story.',
  },
  'truth-producer': {
    northStar: 'Every factual, product, performance, and provenance claim is supported by evidence at the level shown.',
  },
  'continuity-director': {
    northStar: 'Character, product, world, camera, audio, and brand continuity survive from opening frame through resolution.',
  },
  'runtime-proof-specialist': {
    northStar: 'Real product or UI behavior is shown with runtime evidence and never replaced by generated proof.',
  },
  'distribution-money-specialist': {
    northStar: 'Platform packaging and CTA serve the declared audience outcome and monetization path without overstating results.',
  },
  'sound-director': {
    northStar: 'Final audio, speech, music, captions, and visual rhythm reinforce the same story and remain legible together.',
  },
} as const;

type AskMeVideoCouncilRoleId = keyof typeof FCR_ASK_ME_VIDEO_COUNCIL_ROLES;
export type CouncilOutcomeStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'superseded';

export interface CouncilContinuityFingerprintInput {
  project: string;
  workflowId: string;
  goal: string;
  action: string;
  packetVersion: string;
  sourceVersions: readonly string[];
  evidenceIds: readonly string[];
  councilMembers: readonly string[];
  modelRouting: readonly string[];
  decision: string;
}

export interface CouncilContinuityFingerprint {
  contract: typeof FCR_COUNCIL_CONTINUITY_FINGERPRINT_CONTRACT;
  algorithm: 'fnv1a64-canonical-json-v1';
  value: string;
  fields: readonly string[];
}

export interface CreateCouncilContinuityCookieInput {
  project: string;
  workflowId: string;
  stage: string;
  decision: string;
  status: CouncilOutcomeStatus;
  workflowFingerprint: string;
  modelRouting: readonly string[];
  evidenceIds: readonly string[];
  generatedAt: string;
  previousCookieHash?: string | null;
  failureCause?: string | null;
  correction?: string | null;
  founderPreference?: string | null;
  outcomeSummary?: string | null;
}

export interface CouncilContinuityCookie {
  contract: typeof FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT;
  cookie_hash: string;
  previous_cookie_hash: string | null;
  workflow_fingerprint: string;
  project: string;
  workflow_id: string;
  stage: string;
  decision: string;
  status: CouncilOutcomeStatus;
  model_routing: string[];
  evidence_ids: string[];
  failure_cause: string | null;
  correction: string | null;
  founder_preference: string | null;
  outcome_summary: string | null;
  generated_at: string;
}

export interface CouncilContinuityChainVerification {
  valid: boolean;
  brokenAt: number | null;
  reason: string | null;
}

export interface AskMeVideoCouncilDecision {
  contract: typeof FCR_ASK_ME_VIDEO_COUNCIL_CONTRACT;
  applies: boolean;
  operationalAuthority: 'gemini-first';
  truthKernel: '/LEEVIZE';
  members: Array<{
    id: AskMeVideoCouncilRoleId;
    northStar: string;
  }>;
  receiptFields: readonly string[];
  deliberationRules: readonly string[];
}

export interface ContentFoundryCouncilDecision {
  contract: typeof FCR_CONTENT_FOUNDRY_CONTRACT;
  applies: boolean;
  stages: readonly string[];
  packetFields: readonly string[];
  askMeVideoCouncil: AskMeVideoCouncilDecision;
  continuity: {
    fingerprintContract: typeof FCR_COUNCIL_CONTINUITY_FINGERPRINT_CONTRACT;
    cookieContract: typeof FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT;
    fingerprintFields: readonly string[];
    cookieFields: readonly string[];
    rules: readonly string[];
  };
  policyRequiredCapabilityIds: readonly string[];
  requiredProof: readonly string[];
  authority: {
    advisoryOnly: true;
    authorizesPublish: false;
    authorizesSchedule: false;
    authorizesSpend: false;
    continuityFingerprintAuthorizes: false;
  };
}

const CONTENT_GOAL_PATTERN = /\b(content|video|youtube|shorts?|tiktok|reels?|script|thumbnail|title|b-?roll|seo|hashtag|repurpose|newsletter|blog|campaign|social post|facebook post|linkedin post|creator|publishing|publish)\b/i;
const MEDIA_GOAL_PATTERN = /\b(video|youtube|shorts?|tiktok|reels?|b-?roll|storyboard|shot|footage|cinematic|thumbnail)\b/i;
const RUNTIME_PROOF_PATTERN = /\b(product|demo|ui|app|runtime|screen|website|feature|workflow|playwright)\b/i;
const DISTRIBUTION_MONEY_PATTERN = /\b(publish|youtube|shorts?|tiktok|reels?|linkedin|facebook|campaign|cta|sell|sales|conversion|revenue|moneti[sz]e|offer)\b/i;
const SOUND_PATTERN = /\b(audio|voice|voiceover|music|sound|dialogue|narration|lip-?sync|caption)\b/i;

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizedSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, '0');
}

export function createCouncilContinuityFingerprint(
  input: CouncilContinuityFingerprintInput,
): CouncilContinuityFingerprint {
  const subject = {
    project: clean(input.project),
    workflow_id: clean(input.workflowId),
    goal: clean(input.goal),
    action: clean(input.action),
    packet_version: clean(input.packetVersion),
    source_versions: normalizedSortedStrings(input.sourceVersions),
    evidence_ids: normalizedSortedStrings(input.evidenceIds),
    council_members: normalizedSortedStrings(input.councilMembers),
    model_routing: normalizedSortedStrings(input.modelRouting),
    decision: clean(input.decision),
  };

  return {
    contract: FCR_COUNCIL_CONTINUITY_FINGERPRINT_CONTRACT,
    algorithm: 'fnv1a64-canonical-json-v1',
    value: `fp_${fnv1a64(stableStringify(subject))}`,
    fields: [...FCR_COUNCIL_FINGERPRINT_FIELDS],
  };
}

function continuityCookieHashPayload(cookie: Omit<CouncilContinuityCookie, 'contract' | 'cookie_hash'>) {
  return {
    previous_cookie_hash: cookie.previous_cookie_hash,
    workflow_fingerprint: cookie.workflow_fingerprint,
    project: cookie.project,
    workflow_id: cookie.workflow_id,
    stage: cookie.stage,
    decision: cookie.decision,
    status: cookie.status,
    model_routing: cookie.model_routing,
    evidence_ids: cookie.evidence_ids,
    failure_cause: cookie.failure_cause,
    correction: cookie.correction,
    founder_preference: cookie.founder_preference,
    outcome_summary: cookie.outcome_summary,
    generated_at: cookie.generated_at,
  };
}

export function createCouncilContinuityCookie(
  input: CreateCouncilContinuityCookieInput,
): CouncilContinuityCookie {
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error('generatedAt must be an ISO-compatible timestamp');
  }

  const body: Omit<CouncilContinuityCookie, 'contract' | 'cookie_hash'> = {
    previous_cookie_hash: input.previousCookieHash ?? null,
    workflow_fingerprint: clean(input.workflowFingerprint),
    project: clean(input.project),
    workflow_id: clean(input.workflowId),
    stage: clean(input.stage),
    decision: clean(input.decision),
    status: input.status,
    model_routing: normalizedSortedStrings(input.modelRouting),
    evidence_ids: normalizedSortedStrings(input.evidenceIds),
    failure_cause: input.failureCause ? clean(input.failureCause) : null,
    correction: input.correction ? clean(input.correction) : null,
    founder_preference: input.founderPreference ? clean(input.founderPreference) : null,
    outcome_summary: input.outcomeSummary ? clean(input.outcomeSummary) : null,
    generated_at: input.generatedAt,
  };

  return {
    contract: FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT,
    cookie_hash: `ck_${fnv1a64(stableStringify(continuityCookieHashPayload(body)))}`,
    ...body,
  };
}

export function verifyCouncilContinuityCookieChain(
  cookies: readonly CouncilContinuityCookie[],
): CouncilContinuityChainVerification {
  for (let index = 0; index < cookies.length; index += 1) {
    const cookie = cookies[index];
    const expectedPreviousHash = index === 0 ? null : cookies[index - 1].cookie_hash;

    if (cookie.contract !== FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT) {
      return { valid: false, brokenAt: index, reason: 'cookie contract mismatch' };
    }

    if (cookie.previous_cookie_hash !== expectedPreviousHash) {
      return { valid: false, brokenAt: index, reason: 'previous cookie hash mismatch' };
    }

    const { contract: _contract, cookie_hash: _cookieHash, ...body } = cookie;
    const expectedHash = `ck_${fnv1a64(stableStringify(continuityCookieHashPayload(body)))}`;
    if (cookie.cookie_hash !== expectedHash) {
      return { valid: false, brokenAt: index, reason: 'cookie payload hash mismatch' };
    }
  }

  return { valid: true, brokenAt: null, reason: null };
}

function selectAskMeVideoCouncilMembers(goal: string): AskMeVideoCouncilDecision['members'] {
  const roleIds: AskMeVideoCouncilRoleId[] = [
    'viewer-advocate',
    'story-director',
    'truth-producer',
    'continuity-director',
  ];

  if (RUNTIME_PROOF_PATTERN.test(goal)) roleIds.push('runtime-proof-specialist');
  if (DISTRIBUTION_MONEY_PATTERN.test(goal)) roleIds.push('distribution-money-specialist');
  if (SOUND_PATTERN.test(goal)) roleIds.push('sound-director');

  return roleIds.map((id) => ({
    id,
    northStar: FCR_ASK_ME_VIDEO_COUNCIL_ROLES[id].northStar,
  }));
}

function routeAskMeVideoCouncil(goal: string): AskMeVideoCouncilDecision {
  const applies = MEDIA_GOAL_PATTERN.test(goal);

  return {
    contract: FCR_ASK_ME_VIDEO_COUNCIL_CONTRACT,
    applies,
    operationalAuthority: 'gemini-first',
    truthKernel: '/LEEVIZE',
    members: applies ? selectAskMeVideoCouncilMembers(goal) : [],
    receiptFields: applies ? [...FCR_ASK_ME_VIDEO_COUNCIL_RECEIPT_FIELDS] : [],
    deliberationRules: applies
      ? [
          'each selected specialist evaluates the same canonical content packet independently against that role north star before reconciliation',
          'preserve material dissent and rejected reasoning in the council receipt instead of silently flattening disagreement',
          'reconcile to one executable video direction; Gemini-first operational authority interprets and routes the decision while /LEEVIZE remains non-bypassable',
          'use the smallest useful council for the task; optional specialists are selected only when the goal requires their lane',
          'council findings are advisory evidence and cannot mint publish, spend, deployment, credential, or merge authority',
          'bind the reconciled direction, selected council, model routing, evidence, and exact source versions into a deterministic workflow fingerprint before execution',
          'append a new continuity cookie after each meaningful stage or outcome; never rewrite a failed cookie, and preserve its failure cause plus correction in the next link',
          'feed execution evidence and outcome feedback back into the cookie chain so successful and failed council patterns can change future routing without rewriting history',
        ]
      : [],
  };
}

export function isFcrContentGoal(goal: string): boolean {
  return CONTENT_GOAL_PATTERN.test(clean(goal));
}

/**
 * Deterministic Council policy for content work.
 *
 * This does not create a second content application. It binds content goals to
 * one canonical packet and one ordered workflow inside FCR. The workflow is
 * advisory until the caller satisfies the normal FCR mutation/publication
 * authority gate.
 */
export function routeContentFoundryCouncil(
  goal: string,
  action: string,
): ContentFoundryCouncilDecision {
  const normalizedGoal = clean(goal);
  const applies = isFcrContentGoal(normalizedGoal);
  const askMeVideoCouncil = routeAskMeVideoCouncil(normalizedGoal);
  const policyRequiredCapabilityIds: string[] = [];
  const requiredProof: string[] = [];

  if (applies) {
    requiredProof.push(
      `canonical content packet declares: ${FCR_CONTENT_PACKET_FIELDS.join(', ')}`,
      `content workflow preserves ordered stages: ${FCR_CONTENT_FOUNDRY_STAGES.join(' -> ')}`,
      `continuity fingerprint binds: ${FCR_COUNCIL_FINGERPRINT_FIELDS.join(', ')}`,
      `continuity cookie records: ${FCR_COUNCIL_CONTINUITY_COOKIE_FIELDS.join(', ')}`,
      'package is decided before script: title, thumbnail, opening frame, viewer question, and expected payoff must describe the same promise',
      'claims remain evidence-bound; curiosity, SEO, ranking, virality, traction, conversion, or revenue may not be promoted from intent into fact',
      'repurposed assets derive from the same canonical content fingerprint so the core claim, proof, canon, and CTA do not drift silently',
      'any source-version, evidence, council membership, model-routing, or reconciled-decision change creates a new workflow fingerprint and requires fresh downstream verification',
      'continuity cookies are append-only and hash-chained; failed or blocked attempts remain in lineage with cause and correction rather than being overwritten',
      'fingerprints and cookies preserve continuity and learning evidence but cannot grant publication, spend, deployment, credential, or merge authority',
      'measurement is platform-specific and observation-only; learning may change the next bet but never retroactively authorizes publication or spend',
    );

    if (askMeVideoCouncil.applies) {
      requiredProof.push(
        '/LEEVIZE remains the non-bypassable media truth/policy kernel',
        'Ask Me Video convenes the smallest task-specific specialist council before final video direction, preserves material dissent, and records one reconciled decision',
        `Ask Me Video council receipt declares: ${FCR_ASK_ME_VIDEO_COUNCIL_RECEIPT_FIELDS.join(', ')}`,
        'Gemini-first remains the operational authority for intake, interpretation, planning, routing, repair, and release decisions; council roles remain advisory',
        'shot changes are job-driven rather than timer-driven; use ENTER, FEEL, GUIDE, CONNECT, PROVE, and RESOLVE as purposeful shot jobs',
        'WORLD FOOTAGE and PROOF FOOTAGE remain distinguishable; generated atmosphere may not masquerade as product/runtime evidence',
      );
    }

    if (action === 'publish') {
      policyRequiredCapabilityIds.push('proof-led-publishing');
      requiredProof.push('publication requires separate current approval plus provider receipt and post-publication readback');
    }
  }

  return {
    contract: FCR_CONTENT_FOUNDRY_CONTRACT,
    applies,
    stages: applies ? [...FCR_CONTENT_FOUNDRY_STAGES] : [],
    packetFields: applies ? [...FCR_CONTENT_PACKET_FIELDS] : [],
    askMeVideoCouncil,
    continuity: {
      fingerprintContract: FCR_COUNCIL_CONTINUITY_FINGERPRINT_CONTRACT,
      cookieContract: FCR_COUNCIL_CONTINUITY_COOKIE_CONTRACT,
      fingerprintFields: applies ? [...FCR_COUNCIL_FINGERPRINT_FIELDS] : [],
      cookieFields: applies ? [...FCR_COUNCIL_CONTINUITY_COOKIE_FIELDS] : [],
      rules: applies
        ? [
            'fingerprint changes whenever bound source versions, evidence, council/model routing, or decision changes',
            'cookie history is append-only and each cookie points to the exact prior cookie hash',
            'success and failure outcomes remain equally durable inputs to the learning loop',
            'continuity proof is evidence only and never authority',
          ]
        : [],
    },
    policyRequiredCapabilityIds,
    requiredProof,
    authority: {
      advisoryOnly: true,
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
      continuityFingerprintAuthorizes: false,
    },
  };
}
