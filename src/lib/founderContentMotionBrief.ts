export const FOUNDER_CONTENT_MOTION_POLICY = 'lowest_sufficient_motion' as const;

export const ATTACK_3000_LENSES = [
  'attack_ten',
  'red_team',
  'twin',
  'lindy',
  'ooda',
  'l99',
] as const;

export type FounderContentMotionIntent =
  | 'wonder'
  | 'reveal'
  | 'intimacy'
  | 'energy'
  | 'tension'
  | 'explanation';

export type FounderContentMotionRenderer =
  | 'static'
  | 'css'
  | 'reanimated'
  | 'ffmpeg'
  | 'remotion'
  | 'generative';

export type FounderContentMotionLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type FounderContentExperienceClass =
  | 'still'
  | 'motion_poster'
  | 'ambient_loop'
  | 'explainer'
  | 'cinematic_short';

export interface FounderContentMotionNeeds {
  cameraMotionRequired?: boolean;
  layerMotionRequired?: boolean;
  composedCinemaRequired?: boolean;
  pixelMotionRequired?: boolean;
  fullSceneSynthesisRequired?: boolean;
}

export interface FounderContentCinematicContract {
  experience_class: FounderContentExperienceClass;
  approved_source_frame: boolean;
  source_frame_role: 'visual_fingerprint' | 'reference' | null;
  source_frame_fingerprint: string | null;
  minimum_distinct_shots: number;
  requires_causal_progression: boolean;
  requires_world_state_change: boolean;
  requires_payoff: boolean;
  forbids_motion_poster_substitution: boolean;
  forbidden_overlays: string[];
  continuity_cookie: {
    required: boolean;
    stale_rejected: true;
    reissue_on_state_change: true;
    expires_on: readonly ['source_frame_change', 'subject_change', 'evidence_change', 'authority_change', 'runtime_change'];
  };
  attack_3000: {
    enabled: boolean;
    external_test_count_claimed: false;
    lenses: typeof ATTACK_3000_LENSES;
  };
}

export interface FounderContentMotionBrief {
  schema_version: '1.0.0';
  policy: typeof FOUNDER_CONTENT_MOTION_POLICY;
  intent: FounderContentMotionIntent;
  level: FounderContentMotionLevel;
  renderer: FounderContentMotionRenderer;
  selection_reason: string;
  focal_point: { x: number; y: number };
  intensity: number;
  duration_seconds: number;
  fps: 24 | 30 | 60;
  aspect_ratio: '9:16' | '16:9' | '1:1' | '4:5';
  preserve: {
    identity: true;
    clothing: true;
    environment: true;
    typography: true;
  };
  reduced_motion_fallback: true;
  requires_generative_provider: boolean;
  vendor_binding: null;
  cinematic_contract: FounderContentCinematicContract;
}

const INTENTS = new Set<FounderContentMotionIntent>([
  'wonder',
  'reveal',
  'intimacy',
  'energy',
  'tension',
  'explanation',
]);
const EXPERIENCE_CLASSES = new Set<FounderContentExperienceClass>([
  'still',
  'motion_poster',
  'ambient_loop',
  'explainer',
  'cinematic_short',
]);
const ASPECT_RATIOS = new Set<FounderContentMotionBrief['aspect_ratio']>(['9:16', '16:9', '1:1', '4:5']);
const FPS = new Set<FounderContentMotionBrief['fps']>([24, 30, 60]);

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function requiredText(value: unknown, label: string, max = 240): string {
  const normalized = typeof value === 'string' ? value.trim().slice(0, max) : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function selectFounderContentMotionLevel(needs: FounderContentMotionNeeds = {}): FounderContentMotionLevel {
  if (needs.fullSceneSynthesisRequired === true) return 5;
  if (needs.pixelMotionRequired === true) return 4;
  if (needs.composedCinemaRequired === true) return 3;
  if (needs.layerMotionRequired === true) return 2;
  if (needs.cameraMotionRequired === true) return 1;
  return 0;
}

export function rendererForFounderContentMotionLevel(level: FounderContentMotionLevel): FounderContentMotionRenderer {
  if (level === 0) return 'static';
  if (level <= 3) return 'ffmpeg';
  return 'generative';
}

function classifyMotionNeeds(
  experienceClass: FounderContentExperienceClass,
  approvedSourceFrame: boolean,
  needs: FounderContentMotionNeeds = {},
): FounderContentMotionNeeds {
  if (experienceClass !== 'cinematic_short') return needs;
  if (approvedSourceFrame) {
    return {
      ...needs,
      cameraMotionRequired: true,
      layerMotionRequired: true,
      composedCinemaRequired: true,
      pixelMotionRequired: true,
      fullSceneSynthesisRequired: true,
    };
  }
  return { ...needs, composedCinemaRequired: true };
}

export function createFounderContentMotionBrief(input: {
  intent?: FounderContentMotionIntent;
  needs?: FounderContentMotionNeeds;
  selectionReason: string;
  focalPoint?: { x?: number; y?: number };
  intensity?: number;
  durationSeconds?: number;
  fps?: 24 | 30 | 60;
  aspectRatio?: FounderContentMotionBrief['aspect_ratio'];
  experienceClass?: FounderContentExperienceClass;
  approvedSourceFrame?: boolean;
  sourceFrameFingerprint?: string;
  minimumDistinctShots?: number;
  forbidCardOverlays?: boolean;
}): FounderContentMotionBrief {
  const intent = input.intent ?? 'wonder';
  if (!INTENTS.has(intent)) throw new Error('motion intent is unsupported');

  const experienceClass = input.experienceClass ?? 'motion_poster';
  if (!EXPERIENCE_CLASSES.has(experienceClass)) throw new Error('motion experienceClass is unsupported');
  const approvedSourceFrame = input.approvedSourceFrame === true;
  const sourceFrameFingerprint = approvedSourceFrame
    ? requiredText(input.sourceFrameFingerprint, 'motion sourceFrameFingerprint', 160)
    : null;

  const classifiedNeeds = classifyMotionNeeds(experienceClass, approvedSourceFrame, input.needs);
  const level = selectFounderContentMotionLevel(classifiedNeeds);
  const renderer = rendererForFounderContentMotionLevel(level);
  const selectionReason = requiredText(input.selectionReason, 'motion selectionReason');
  const fps = input.fps ?? 30;
  const aspectRatio = input.aspectRatio ?? '9:16';
  if (!FPS.has(fps)) throw new Error('motion fps must be 24, 30, or 60');
  if (!ASPECT_RATIOS.has(aspectRatio)) throw new Error('motion aspectRatio is unsupported');

  const cinematicShort = experienceClass === 'cinematic_short';
  const minimumDistinctShots = Math.round(
    boundedNumber(input.minimumDistinctShots, cinematicShort ? 6 : 1, cinematicShort ? 4 : 1, 12),
  );

  return {
    schema_version: '1.0.0',
    policy: FOUNDER_CONTENT_MOTION_POLICY,
    intent,
    level,
    renderer,
    selection_reason: selectionReason,
    focal_point: {
      x: boundedNumber(input.focalPoint?.x, 0.5, 0, 1),
      y: boundedNumber(input.focalPoint?.y, 0.5, 0, 1),
    },
    intensity: boundedNumber(input.intensity, 0.35, 0, 1),
    duration_seconds: boundedNumber(input.durationSeconds, 8, 1, 60),
    fps,
    aspect_ratio: aspectRatio,
    preserve: {
      identity: true,
      clothing: true,
      environment: true,
      typography: true,
    },
    reduced_motion_fallback: true,
    requires_generative_provider: level >= 4,
    vendor_binding: null,
    cinematic_contract: {
      experience_class: experienceClass,
      approved_source_frame: approvedSourceFrame,
      source_frame_role: approvedSourceFrame ? 'visual_fingerprint' : null,
      source_frame_fingerprint: sourceFrameFingerprint,
      minimum_distinct_shots: minimumDistinctShots,
      requires_causal_progression: cinematicShort,
      requires_world_state_change: cinematicShort,
      requires_payoff: cinematicShort,
      forbids_motion_poster_substitution: cinematicShort,
      forbidden_overlays: input.forbidCardOverlays === true ? ['cards', 'floating_ui'] : [],
      continuity_cookie: {
        required: approvedSourceFrame && cinematicShort,
        stale_rejected: true,
        reissue_on_state_change: true,
        expires_on: ['source_frame_change', 'subject_change', 'evidence_change', 'authority_change', 'runtime_change'],
      },
      attack_3000: {
        enabled: cinematicShort,
        external_test_count_claimed: false,
        lenses: ATTACK_3000_LENSES,
      },
    },
  };
}
