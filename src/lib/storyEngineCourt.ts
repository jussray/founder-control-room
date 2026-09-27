export const FCR_STORYENGINE_COURT_CONTRACT = 'juss/storyengine-three-council-court@v1' as const;
export const FCR_STORYENGINE_CREATIVE_FREEDOM_RULE =
  'Structure should accelerate expression, never restrict it.' as const;

export const FCR_STORYENGINE_COUNCIL_IDS = ['writers', 'ai', 'production'] as const;
export type StoryEngineCouncilId = (typeof FCR_STORYENGINE_COUNCIL_IDS)[number];
export type StoryEngineCourtPhase =
  | 'think'
  | 'imagine'
  | 'write'
  | 'visualize'
  | 'video'
  | 'review';
export type StoryEngineCouncilPosture = 'lead' | 'support' | 'watch';

export const FCR_STORYENGINE_WRITERS_COUNCIL_ROLES = [
  'story-architect',
  'developmental-editor',
  'scene-writer',
  'character-editor',
  'dialogue-specialist',
  'worldbuilder',
  'genre-specialist',
  'audience-age-specialist',
  'line-editor',
  'research-editor',
  'continuity-editor',
  'screenwriter',
  'comics-writer',
  'narrative-game-designer',
  'lyricist-poet',
  'publishing-commercial-reader',
  'beta-first-reader',
] as const;

export const FCR_STORYENGINE_AI_COUNCIL_ROLES = [
  'primary-thinker',
  'independent-thinker',
  'researcher',
  'critic',
  'synthesizer',
  'model-router',
] as const;

export const FCR_STORYENGINE_PRODUCTION_COUNCIL_ROLES = [
  'creative-director',
  'art-director',
  'cinematographer',
  'storyboard-artist',
  'production-designer',
  'character-continuity-guardian',
  'image-generation-specialist',
  'video-generation-specialist',
  'motion-director',
  'editor',
  'sound-designer',
  'voice-director',
  'caption-typography-specialist',
  'media-router',
  'makevideo',
  'leevize',
  'visual-canon-continuity',
] as const;

export const FCR_STORYENGINE_CREATOR_ESCAPE_ROUTES = [
  'accept',
  'keep-mine',
  'blend',
  'try-another-direction',
  'ask-another-council',
  'challenge-the-ruling',
  'custom-direction-free-text',
] as const;

export const FCR_STORYENGINE_COURT_RECEIPT_FIELDS = [
  'project',
  'creative_intent',
  'base_context',
  'phase',
  'decision',
  'writers_recommendation',
  'writers_dissent',
  'ai_recommendation',
  'ai_evidence',
  'ai_uncertainty',
  'production_recommendation',
  'production_continuity_risks',
  'devil_strongest_challenge',
  'creator_ruling',
  'creator_rejected_options',
  'creator_custom_instruction',
  'canon_effect',
  'provider_evidence',
  'next_action',
] as const;

export interface StoryEngineCourtCouncilSelection {
  id: StoryEngineCouncilId;
  posture: StoryEngineCouncilPosture;
  roles: readonly string[];
  jurisdiction: string;
}

export interface StoryEngineCourtDecision {
  contract: typeof FCR_STORYENGINE_COURT_CONTRACT;
  applies: boolean;
  phase: StoryEngineCourtPhase | null;
  creativeFreedomRule: typeof FCR_STORYENGINE_CREATIVE_FREEDOM_RULE;
  councils: StoryEngineCourtCouncilSelection[];
  independentFirst: true;
  devilCrossExaminationRequired: boolean;
  creatorFinalAuthority: true;
  preserveDissent: true;
  toolCapabilityGrantsPermission: false;
  providerTruthRule: 'live-requires-verified-provider-receipt';
  simulatedRoleRule: 'simulated-roles-must-be-labeled-simulated';
  userFreedom: {
    presetsAreOptionalShortcuts: true;
    otherOrCustomMustRemainAvailable: true;
    freeTextEscapeHatchRequired: true;
    importantChoicesEditableLater: true;
    baseContextIsDurableCreativeIntent: true;
    escapeRoutes: readonly string[];
  };
  policyRequiredCapabilityIds: readonly string[];
  requiredProof: readonly string[];
  receiptFields: readonly string[];
}

const STORYENGINE_PROJECT_PATTERN = /^(?:jussray\/)?(?:storyengine|story-engine|l99)$/i;
const STORYENGINE_GOAL_PATTERN = /\b(storyengine|story engine|l99)\b/i;
const VIDEO_PATTERN = /(?:\/makevideo\b|\bvideo\b|\btrailer\b|\bfilm sequence\b|\bshot list\b|\bedit rhythm\b)/i;
const VISUALIZE_PATTERN = /\b(visuali[sz]e|image|art|storyboard|character design|environment design|visual canon|cinematic look)\b/i;
const WRITE_PATTERN = /\b(write|writing|draft|rewrite|chapter|scene|dialogue|outline|screenplay|script|novel|story)\b/i;
const REVIEW_PATTERN = /\b(review|edit|critique|continuity|canon check|line edit|developmental edit|proof)\b/i;
const THINK_PATTERN = /\b(think|plan|reason|brainstorm|decide|compare|strategy|structure)\b/i;
const IMAGINE_PATTERN = /\b(imagine|idea|concept|world|character|mood|feel|tone|theme|premise)\b/i;

function detectPhase(goal: string): StoryEngineCourtPhase {
  if (VIDEO_PATTERN.test(goal)) return 'video';
  if (VISUALIZE_PATTERN.test(goal)) return 'visualize';
  if (WRITE_PATTERN.test(goal)) return 'write';
  if (REVIEW_PATTERN.test(goal)) return 'review';
  if (THINK_PATTERN.test(goal)) return 'think';
  if (IMAGINE_PATTERN.test(goal)) return 'imagine';
  return 'imagine';
}

function postureFor(phase: StoryEngineCourtPhase, council: StoryEngineCouncilId): StoryEngineCouncilPosture {
  const map: Record<StoryEngineCourtPhase, Record<StoryEngineCouncilId, StoryEngineCouncilPosture>> = {
    think: { writers: 'lead', ai: 'lead', production: 'support' },
    imagine: { writers: 'lead', ai: 'support', production: 'lead' },
    write: { writers: 'lead', ai: 'support', production: 'watch' },
    visualize: { writers: 'support', ai: 'support', production: 'lead' },
    video: { writers: 'lead', ai: 'support', production: 'lead' },
    review: { writers: 'lead', ai: 'lead', production: 'support' },
  };
  return map[phase][council];
}

function rolesFor(council: StoryEngineCouncilId): readonly string[] {
  if (council === 'writers') return FCR_STORYENGINE_WRITERS_COUNCIL_ROLES;
  if (council === 'ai') return FCR_STORYENGINE_AI_COUNCIL_ROLES;
  return FCR_STORYENGINE_PRODUCTION_COUNCIL_ROLES;
}

function jurisdictionFor(council: StoryEngineCouncilId): string {
  if (council === 'writers') return 'story craft, reader experience, voice, character, structure, genre, and continuity';
  if (council === 'ai') return 'reasoning quality, evidence, model and tool routing, independent challenge, and reconciliation';
  return 'turning imagination into coherent visual, audio, motion, and video media without losing story truth';
}

export function routeStoryEngineCourt(goal: string, projectSlug: string): StoryEngineCourtDecision {
  const applies = STORYENGINE_PROJECT_PATTERN.test(projectSlug.trim()) || STORYENGINE_GOAL_PATTERN.test(goal);
  const phase = applies ? detectPhase(goal) : null;
  const councils = applies && phase
    ? FCR_STORYENGINE_COUNCIL_IDS.map((id) => ({
        id,
        posture: postureFor(phase, id),
        roles: rolesFor(id),
        jurisdiction: jurisdictionFor(id),
      }))
    : [];

  return {
    contract: FCR_STORYENGINE_COURT_CONTRACT,
    applies,
    phase,
    creativeFreedomRule: FCR_STORYENGINE_CREATIVE_FREEDOM_RULE,
    councils,
    independentFirst: true,
    devilCrossExaminationRequired: applies,
    creatorFinalAuthority: true,
    preserveDissent: true,
    toolCapabilityGrantsPermission: false,
    providerTruthRule: 'live-requires-verified-provider-receipt',
    simulatedRoleRule: 'simulated-roles-must-be-labeled-simulated',
    userFreedom: {
      presetsAreOptionalShortcuts: true,
      otherOrCustomMustRemainAvailable: true,
      freeTextEscapeHatchRequired: true,
      importantChoicesEditableLater: true,
      baseContextIsDurableCreativeIntent: true,
      escapeRoutes: [...FCR_STORYENGINE_CREATOR_ESCAPE_ROUTES],
    },
    policyRequiredCapabilityIds: applies ? ['devil'] : [],
    requiredProof: applies
      ? [
          'all three StoryEngine domain councils are represented for consequential creative work, with task-specific lead/support/watch posture rather than waking every specialist by default',
          'Writers, AI, and Production findings are formed independently before reconciliation to reduce anchoring and fake consensus',
          '/DEVIL cross-examines the independent findings before synthesis; disagreement is preserved instead of flattened',
          'creator remains final authority and can keep, blend, reject, challenge, redirect, or enter a custom free-text direction',
          'structured creative presets remain optional shortcuts; Other/Custom plus free-text escape hatches are available wherever presets may constrain expression',
          'Base Context is preserved as durable creative intent and important project choices remain editable later',
          'Council advice cannot mutate canon, publish, spend, deploy, delete, or cross project boundaries without the owning authority gate',
          'named provider seats are labeled live only with verified connector/API/runtime evidence; simulated roles are labeled simulated',
          'tool capability is not permission, and model agreement is not proof',
          'Court receipt preserves recommendations, dissent, evidence, uncertainty, strongest Devil challenge, creator ruling, canon effect, and next action',
        ]
      : [],
    receiptFields: applies ? [...FCR_STORYENGINE_COURT_RECEIPT_FIELDS] : [],
  };
}
