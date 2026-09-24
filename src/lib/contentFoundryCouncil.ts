export const FCR_CONTENT_FOUNDRY_CONTRACT = 'juss/content-foundry-council@v1' as const;
export const FCR_ASK_ME_VIDEO_COUNCIL_CONTRACT = 'juss/ask-me-video-council@v1' as const;

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

export const FCR_ASK_ME_VIDEO_COUNCIL_RECEIPT_FIELDS = [
  'council_members',
  'member_findings',
  'dissent',
  'reconciled_direction',
  'decision_rationale',
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
          'feed execution evidence and outcome feedback back into the receipt so successful council patterns can compound without rewriting history',
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
      'package is decided before script: title, thumbnail, opening frame, viewer question, and expected payoff must describe the same promise',
      'claims remain evidence-bound; curiosity, SEO, ranking, virality, traction, conversion, or revenue may not be promoted from intent into fact',
      'repurposed assets derive from the same canonical content fingerprint so the core claim, proof, canon, and CTA do not drift silently',
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
