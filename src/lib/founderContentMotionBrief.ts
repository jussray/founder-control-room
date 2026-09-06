export const FOUNDER_CONTENT_MOTION_POLICY = 'lowest_sufficient_motion' as const;

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

export interface FounderContentMotionNeeds {
  cameraMotionRequired?: boolean;
  layerMotionRequired?: boolean;
  composedCinemaRequired?: boolean;
  pixelMotionRequired?: boolean;
  fullSceneSynthesisRequired?: boolean;
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
}

const INTENTS = new Set<FounderContentMotionIntent>([
  'wonder',
  'reveal',
  'intimacy',
  'energy',
  'tension',
  'explanation',
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

export function createFounderContentMotionBrief(input: {
  intent?: FounderContentMotionIntent;
  needs?: FounderContentMotionNeeds;
  selectionReason: string;
  focalPoint?: { x?: number; y?: number };
  intensity?: number;
  durationSeconds?: number;
  fps?: 24 | 30 | 60;
  aspectRatio?: FounderContentMotionBrief['aspect_ratio'];
}): FounderContentMotionBrief {
  const intent = input.intent ?? 'wonder';
  if (!INTENTS.has(intent)) throw new Error('motion intent is unsupported');

  const level = selectFounderContentMotionLevel(input.needs);
  const renderer = rendererForFounderContentMotionLevel(level);
  const selectionReason = requiredText(input.selectionReason, 'motion selectionReason');
  const fps = input.fps ?? 30;
  const aspectRatio = input.aspectRatio ?? '9:16';
  if (!FPS.has(fps)) throw new Error('motion fps must be 24, 30, or 60');
  if (!ASPECT_RATIOS.has(aspectRatio)) throw new Error('motion aspectRatio is unsupported');

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
  };
}
