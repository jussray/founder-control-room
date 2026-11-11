import type { MediaRoutingRequestV1 } from './mediaRouter.js';
import { mediaFingerprint } from './mediaRouter.js';

export const VISUAL_GRAMMAR_VERSION = 'visual-grammar/v1' as const;

export const VISUAL_GRAMMAR_MODES = [
  'handwritten',
  'decision_matrix',
  'infographic',
  'canvas',
  'layers',
  'cycle',
  'diagram',
  'roadmap',
  'sketchnotes',
  'iceberg',
  'blueprint',
  'exploded_view',
  'tree',
  'timeline',
] as const;

export type VisualGrammarModeV1 = (typeof VISUAL_GRAMMAR_MODES)[number];
export type VisualGrammarAssetKindV1 = 'image' | 'video';

export interface VisualGrammarProfileV1 {
  mode: VisualGrammarModeV1;
  viewerJob: string;
  imageComposition: string;
  videoReveal: string;
}

export const VISUAL_GRAMMAR_PROFILES: Readonly<Record<VisualGrammarModeV1, VisualGrammarProfileV1>> = Object.freeze({
  handwritten: {
    mode: 'handwritten',
    viewerJob: 'Make a thought, note, or personal explanation feel direct and human.',
    imageComposition: 'Use a legible handwritten-note hierarchy with one dominant message and restrained annotations.',
    videoReveal: 'Reveal the thought as a paced write-on sequence; preserve legibility and do not animate every mark at once.',
  },
  decision_matrix: {
    mode: 'decision_matrix',
    viewerJob: 'Compare options against explicit criteria so a choice becomes easier.',
    imageComposition: 'Use a compact option-by-criterion grid with the decision signal visually dominant.',
    videoReveal: 'Introduce criteria first, compare options row by row, then resolve to the decision without hiding tradeoffs.',
  },
  infographic: {
    mode: 'infographic',
    viewerJob: 'Compress a small evidence set, statistic set, or factual explanation into one scannable view.',
    imageComposition: 'Use one reading path, a small number of evidence blocks, and labels that remain readable at delivery size.',
    videoReveal: 'Sequence evidence blocks in the same reading order and finish on the single takeaway.',
  },
  canvas: {
    mode: 'canvas',
    viewerJob: 'Organize a concept or operating model into a bounded set of coordinated areas.',
    imageComposition: 'Use a clearly labeled canvas whose regions each answer a different part of the problem.',
    videoReveal: 'Populate the canvas region by region while preserving the full-system context.',
  },
  layers: {
    mode: 'layers',
    viewerJob: 'Show stacked levels, depth, dependencies, or a system from surface to foundation.',
    imageComposition: 'Use visibly separated layers with clear ordering and minimal cross-layer noise.',
    videoReveal: 'Build or peel layers one at a time so the viewer understands order and dependency.',
  },
  cycle: {
    mode: 'cycle',
    viewerJob: 'Explain a repeating loop, feedback system, or recurring process.',
    imageComposition: 'Use a closed loop with directional flow and a distinct job for every stage.',
    videoReveal: 'Travel the loop once in order, then show the recurrence or feedback connection.',
  },
  diagram: {
    mode: 'diagram',
    viewerJob: 'Explain relationships, flows, architecture, or how parts interact.',
    imageComposition: 'Use nodes and connectors only where they communicate a real relationship; keep the dominant flow obvious.',
    videoReveal: 'Reveal the system by causal or directional flow rather than by arbitrary motion.',
  },
  roadmap: {
    mode: 'roadmap',
    viewerJob: 'Show the ordered path from current state to a future outcome.',
    imageComposition: 'Use milestones, phases, or gates with a clear start, progression, and destination.',
    videoReveal: 'Move through milestones in order and make dependencies or gates explicit before advancing.',
  },
  sketchnotes: {
    mode: 'sketchnotes',
    viewerJob: 'Capture a cluster of ideas while preserving a memorable visual hierarchy.',
    imageComposition: 'Use a dominant central idea with a limited set of annotated branches, icons, or shorthand marks.',
    videoReveal: 'Grow the note map around the central idea in conceptual groups, not random doodle order.',
  },
  iceberg: {
    mode: 'iceberg',
    viewerJob: 'Separate the visible surface from hidden causes, constraints, or deeper structure.',
    imageComposition: 'Keep the visible-above and hidden-below regions unmistakable and proportionate to the explanation.',
    videoReveal: 'Establish the visible surface first, then descend to the hidden layer and connect cause to effect.',
  },
  blueprint: {
    mode: 'blueprint',
    viewerJob: 'Explain how something should be built, arranged, or specified.',
    imageComposition: 'Use a build-plan view with labeled components, dimensions or constraints only when they carry meaning.',
    videoReveal: 'Trace the build or specification in dependency order, finishing on the assembled plan.',
  },
  exploded_view: {
    mode: 'exploded_view',
    viewerJob: 'Show how a whole is composed from distinct parts.',
    imageComposition: 'Separate components spatially while preserving enough alignment to understand assembly.',
    videoReveal: 'Disassemble to expose component jobs, then reassemble to prove the whole-part relationship.',
  },
  tree: {
    mode: 'tree',
    viewerJob: 'Show hierarchy, taxonomy, lineage, or branching choices.',
    imageComposition: 'Use one root and clearly nested branches; avoid crossing hierarchy lines.',
    videoReveal: 'Grow from root to branches by level so parent-child relationships remain obvious.',
  },
  timeline: {
    mode: 'timeline',
    viewerJob: 'Show chronology, sequence, history, or change over time.',
    imageComposition: 'Use a single chronological axis with only meaningful events, state changes, or dates.',
    videoReveal: 'Advance chronologically and let each event inherit context from the prior state.',
  },
});

export interface VisualGrammarSelectionV1 {
  contract: typeof VISUAL_GRAMMAR_VERSION;
  assetKind: VisualGrammarAssetKindV1;
  viewerJob: string;
  primaryMode: VisualGrammarModeV1 | null;
  supportingMode: VisualGrammarModeV1 | null;
  supportingRationale: string | null;
  rationale: string;
  imageComposition: string | null;
  videoReveal: string | null;
  sourceProtocol: 'MAKEVIDEO' | 'PROJECT_LOCAL' | 'MANUAL';
  sourceRecordId: string | null;
  structureGrantsTruthOrAuthority: false;
  fingerprint: string;
}

export interface CreateVisualGrammarSelectionV1Input {
  assetKind: VisualGrammarAssetKindV1;
  viewerJob: string;
  primaryMode?: VisualGrammarModeV1 | null;
  supportingMode?: VisualGrammarModeV1 | null;
  supportingRationale?: string | null;
  rationale?: string;
  sourceProtocol?: VisualGrammarSelectionV1['sourceProtocol'];
  sourceRecordId?: string | null;
}

function clean(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function visualGrammarCore(selection: Omit<VisualGrammarSelectionV1, 'fingerprint'>): Omit<VisualGrammarSelectionV1, 'fingerprint'> {
  return selection;
}

function fingerprintSelection(selection: Omit<VisualGrammarSelectionV1, 'fingerprint'>): string {
  return `sha256:${mediaFingerprint(visualGrammarCore(selection))}`;
}

export function inferVisualGrammarMode(viewerJob: string): VisualGrammarModeV1 | null {
  const text = clean(viewerJob).toLowerCase().replace(/[_-]+/g, ' ');
  if (!text) return null;

  const rules: ReadonlyArray<[VisualGrammarModeV1, RegExp]> = [
    ['decision_matrix', /\b(compare|comparison|choose|choice|decide|decision|tradeoffs?|options?)\b/],
    ['timeline', /\b(chronology|chronological|history|historical|sequence|over time|when|then|before|after)\b/],
    ['roadmap', /\b(roadmap|milestones?|phases?|journey|next steps?|path forward)\b/],
    ['cycle', /\b(cycle|loop|recurring|repeat|feedback)\b/],
    ['layers', /\b(layers?|stack|tiers?|depth|foundation)\b/],
    ['iceberg', /\b(iceberg|hidden|beneath|under the surface|root causes?)\b/],
    ['exploded_view', /\b(exploded|components?|parts|anatomy|assembled|disassembled)\b/],
    ['tree', /\b(tree|hierarchy|taxonomy|lineage|branches?|parent child)\b/],
    ['blueprint', /\b(blueprint|specification|build plan|floor plan|schematic)\b/],
    ['diagram', /\b(diagram|flow|architecture|relationships?|how it works|system map)\b/],
    ['canvas', /\b(canvas|business model|framework|quadrants?|operating model)\b/],
    ['infographic', /\b(infographic|statistics?|metrics?|facts?|data summary)\b/],
    ['handwritten', /\b(handwritten|personal note|letter|journal|direct note)\b/],
    ['sketchnotes', /\b(sketchnotes?|brainstorm|lecture notes?|idea map|visual notes?)\b/],
  ];

  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function createVisualGrammarSelectionV1(input: CreateVisualGrammarSelectionV1Input): VisualGrammarSelectionV1 {
  const viewerJob = clean(input.viewerJob);
  if (!viewerJob) throw new TypeError('viewerJob is required.');

  const primaryMode = input.primaryMode === undefined ? inferVisualGrammarMode(viewerJob) : input.primaryMode;
  const supportingMode = input.supportingMode ?? null;
  const supportingRationale = clean(input.supportingRationale) || null;

  if (primaryMode !== null && !VISUAL_GRAMMAR_MODES.includes(primaryMode)) {
    throw new TypeError(`Unsupported visual grammar mode: ${primaryMode}`);
  }
  if (supportingMode !== null && !VISUAL_GRAMMAR_MODES.includes(supportingMode)) {
    throw new TypeError(`Unsupported supporting visual grammar mode: ${supportingMode}`);
  }
  if (supportingMode !== null && primaryMode === null) {
    throw new TypeError('supportingMode requires a primaryMode.');
  }
  if (supportingMode !== null && supportingMode === primaryMode) {
    throw new TypeError('supportingMode must be distinct from primaryMode.');
  }
  if (supportingMode !== null && !supportingRationale) {
    throw new TypeError('supportingRationale is required when supportingMode is supplied.');
  }
  if (supportingMode === null && supportingRationale) {
    throw new TypeError('supportingRationale requires supportingMode.');
  }

  const profile = primaryMode ? VISUAL_GRAMMAR_PROFILES[primaryMode] : null;
  const rationale = clean(input.rationale) || (profile
    ? `Use ${primaryMode} because it best serves the viewer job: ${viewerJob}`
    : `No structural visual grammar is required for this viewer job: ${viewerJob}`);
  const sourceRecordId = clean(input.sourceRecordId) || null;
  const sourceProtocol = input.sourceProtocol ?? 'PROJECT_LOCAL';

  if (sourceProtocol !== 'PROJECT_LOCAL' && !sourceRecordId) {
    throw new TypeError('sourceRecordId is required for MAKEVIDEO or MANUAL visual grammar selections.');
  }

  const core: Omit<VisualGrammarSelectionV1, 'fingerprint'> = {
    contract: VISUAL_GRAMMAR_VERSION,
    assetKind: input.assetKind,
    viewerJob,
    primaryMode,
    supportingMode,
    supportingRationale,
    rationale,
    imageComposition: input.assetKind === 'image' && profile ? profile.imageComposition : null,
    videoReveal: input.assetKind === 'video' && profile ? profile.videoReveal : null,
    sourceProtocol,
    sourceRecordId,
    structureGrantsTruthOrAuthority: false,
  };

  return Object.freeze({ ...core, fingerprint: fingerprintSelection(core) });
}

export function validateVisualGrammarSelectionV1(selection: VisualGrammarSelectionV1): string[] {
  const errors: string[] = [];
  if (selection.contract !== VISUAL_GRAMMAR_VERSION) errors.push('unsupported visual grammar contract');
  if (!['image', 'video'].includes(selection.assetKind)) errors.push('visual grammar assetKind must be image or video');
  if (!clean(selection.viewerJob)) errors.push('visual grammar viewerJob is required');
  if (selection.primaryMode !== null && !VISUAL_GRAMMAR_MODES.includes(selection.primaryMode)) errors.push('unsupported primary visual grammar mode');
  if (selection.supportingMode !== null && !VISUAL_GRAMMAR_MODES.includes(selection.supportingMode)) errors.push('unsupported supporting visual grammar mode');
  if (selection.supportingMode !== null && selection.primaryMode === null) errors.push('supporting visual grammar mode requires a primary mode');
  if (selection.supportingMode !== null && selection.supportingMode === selection.primaryMode) errors.push('supporting visual grammar mode must be distinct');
  if (selection.supportingMode !== null && !clean(selection.supportingRationale)) errors.push('supporting visual grammar mode requires rationale');
  if (selection.supportingMode === null && selection.supportingRationale !== null) errors.push('supporting rationale requires supporting mode');
  if (selection.structureGrantsTruthOrAuthority !== false) errors.push('visual structure cannot grant truth or authority');
  if (selection.sourceProtocol !== 'PROJECT_LOCAL' && !clean(selection.sourceRecordId)) errors.push('external/manual visual grammar selection requires sourceRecordId');

  const { fingerprint, ...core } = selection;
  if (fingerprint !== fingerprintSelection(core)) errors.push('visual grammar fingerprint mismatch');
  return errors;
}

export type MediaRoutingRequestWithVisualGrammarV1 = MediaRoutingRequestV1 & {
  visualGrammar: VisualGrammarSelectionV1;
};

export function bindVisualGrammarToMediaRoutingRequest(
  request: MediaRoutingRequestV1,
  selection: VisualGrammarSelectionV1,
): MediaRoutingRequestWithVisualGrammarV1 {
  const errors = validateVisualGrammarSelectionV1(selection);
  if (errors.length > 0) throw new TypeError(errors.join('; '));
  if (request.type !== selection.assetKind) {
    throw new TypeError(`visual grammar ${selection.assetKind} selection cannot bind to ${request.type} request`);
  }

  // Media Router already fingerprints the complete runtime request object. Keeping
  // visualGrammar enumerable here makes a structure/rationale change a new route
  // identity without giving this module any provider, release, or publication authority.
  return Object.freeze({ ...request, visualGrammar: selection });
}
