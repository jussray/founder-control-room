export const FCR_CONTENT_FOUNDRY_CONTRACT = 'juss/content-foundry-council@v1' as const;

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

export interface ContentFoundryCouncilDecision {
  contract: typeof FCR_CONTENT_FOUNDRY_CONTRACT;
  applies: boolean;
  stages: readonly string[];
  packetFields: readonly string[];
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

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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

    if (MEDIA_GOAL_PATTERN.test(normalizedGoal)) {
      requiredProof.push(
        '/LEEVIZE remains the non-bypassable media truth/policy kernel',
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
