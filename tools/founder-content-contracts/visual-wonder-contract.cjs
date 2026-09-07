'use strict';

const CREATIVE_MODES = new Set([
  'cinematic-proof',
  'mythic-founder',
  'dream-product',
  'character-story',
  'product-experience',
]);

const FORMS = new Set([
  'hero-still-4x5',
  'short-video-9x16',
  'carousel',
  'loop-clip',
  'product-surface',
]);

const EMOTIONS = new Set([
  'wonder',
  'awe',
  'tension',
  'revelation',
  'elegance',
  'ambition',
  'intimacy',
  'inevitability',
  'joy',
  'safety',
  'belonging',
]);

const HARD_ARTIFACT_GATES = [
  'proof_integrity',
  'nonliteral_interpretation',
  'accessibility',
  'canon_integrity',
  'human_agency',
];

const SOFT_ARTIFACT_GATES = [
  'scroll_stop',
  'beauty',
  'wonder',
  'meaning',
  'platform_native',
  'memorability',
  'brand_fit',
  'uncluttered',
];

function text(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function list(value, max = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 160)).filter(Boolean))].slice(0, max);
}

function fail(errors) {
  throw Object.assign(new Error(`VISUAL_WONDER_REJECTED: ${errors.join('; ')}`), {
    code: 'VISUAL_WONDER_REJECTED',
    details: errors,
  });
}

function normalizePhrase(value) {
  return text(value, 320)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function requireDistinctScene(thesis, sceneConcept, visualHook) {
  const normalizedThesis = normalizePhrase(thesis);
  const normalizedScene = normalizePhrase(sceneConcept);
  const normalizedHook = normalizePhrase(visualHook);
  if (!normalizedScene) return ['scene_concept is required'];
  const errors = [];
  if (normalizedScene === normalizedThesis) {
    errors.push('scene_concept must interpret the thesis rather than repeat it literally');
  }
  if (normalizedHook && normalizedHook === normalizedThesis) {
    errors.push('visual_hook must create a visual curiosity gap rather than restate the thesis');
  }
  return errors;
}

function validateProof(input = {}) {
  const required = input.required !== false;
  const proofObject = text(input.proof_object, 240);
  const proofLinks = list(input.proof_links, 8);
  const truthBoundary = text(input.truth_boundary, 320);
  const errors = [];
  if (required && !proofObject) errors.push('proof.proof_object is required when proof is required');
  if (required && proofLinks.length === 0) errors.push('proof.proof_links must contain at least one public-safe receipt when proof is required');
  if (!truthBoundary) errors.push('proof.truth_boundary is required so the visual cannot imply more than the receipt proves');
  return {
    errors,
    value: {
      required,
      proof_object: proofObject || null,
      proof_links: proofLinks,
      truth_boundary: truthBoundary || null,
    },
  };
}

function validateHumanOutput(input = {}) {
  const errors = [];
  const humanOutcome = text(input.human_outcome, 280);
  const comprehension = text(input.comprehension_goal, 280);
  const agency = input.preserves_human_agency === true;
  const manipulation = input.uses_manipulative_dark_patterns === true;
  if (!humanOutcome) errors.push('human.human_outcome is required');
  if (!comprehension) errors.push('human.comprehension_goal is required');
  if (!agency) errors.push('human.preserves_human_agency must be true');
  if (manipulation) errors.push('human.uses_manipulative_dark_patterns must be false');
  return {
    errors,
    value: {
      human_outcome: humanOutcome || null,
      comprehension_goal: comprehension || null,
      preserves_human_agency: agency,
      uses_manipulative_dark_patterns: manipulation,
    },
  };
}

function validatePlatform(input = {}, form) {
  const targets = list(input.targets, 8).map((value) => value.toLowerCase());
  const errors = [];
  if (targets.length === 0) errors.push('platform.targets must name at least one destination');
  const duration = input.duration_seconds == null ? null : Number(input.duration_seconds);
  if (form === 'short-video-9x16' || form === 'loop-clip') {
    if (!Number.isFinite(duration) || duration < 3 || duration > 60) {
      errors.push('platform.duration_seconds must be between 3 and 60 for moving short-form media');
    }
  }
  return {
    errors,
    value: {
      targets,
      duration_seconds: duration,
      native_behavior: text(input.native_behavior, 280) || null,
    },
  };
}

function buildAttack2000Plan() {
  return Object.freeze({
    version: 1,
    kind: 'juss/attack-2000-visual-plan',
    reasoning_pressure_budget: 2000,
    external_test_count_claimed: false,
    pass_1_concept_attack: Object.freeze([
      'premise',
      'literalism',
      'visual-curiosity-gap',
      'emotional-pull',
      'proof-fit',
      'human-outcome',
      'platform-native-form',
      'brand-and-canon-fit',
    ]),
    pass_2_artifact_attack: Object.freeze([
      ...HARD_ARTIFACT_GATES,
      ...SOFT_ARTIFACT_GATES,
      'safe-zones',
      'reduced-motion-when-applicable',
      'text-legibility',
      'ai-slop-tells',
      'proof-overclaim',
    ]),
  });
}

function buildVisualWonderBrief(input = {}) {
  const errors = [];
  const thesis = text(input.thesis, 320);
  const mode = text(input.creative_mode, 80).toLowerCase();
  const form = text(input.form, 80).toLowerCase();
  const visualHook = text(input.visual_hook, 320);
  const sceneConcept = text(input.scene_concept, 420);
  const motionLanguage = text(input.motion_language, 320);
  const memoryLine = text(input.memory_line, 240);
  const emotionalIntent = list(input.emotional_intent, 2).map((value) => value.toLowerCase());

  if (!thesis) errors.push('thesis is required');
  if (!CREATIVE_MODES.has(mode)) errors.push('creative_mode is invalid');
  if (!FORMS.has(form)) errors.push('form is invalid');
  if (!visualHook) errors.push('visual_hook is required');
  if (!memoryLine) errors.push('memory_line is required');
  if (emotionalIntent.length === 0 || emotionalIntent.some((value) => !EMOTIONS.has(value))) {
    errors.push('emotional_intent must contain one or two approved emotional states');
  }
  errors.push(...requireDistinctScene(thesis, sceneConcept, visualHook));

  if ((form === 'short-video-9x16' || form === 'loop-clip' || form === 'product-surface') && !motionLanguage) {
    errors.push('motion_language is required for moving or interactive forms');
  }

  const proof = validateProof(input.proof);
  const human = validateHumanOutput(input.human);
  const platform = validatePlatform(input.platform, form);
  errors.push(...proof.errors, ...human.errors, ...platform.errors);
  if (errors.length > 0) fail(errors);

  return Object.freeze({
    version: 1,
    kind: 'juss/visual-wonder-brief',
    thesis,
    creative_mode: mode,
    form,
    emotional_intent: emotionalIntent,
    visual_hook: visualHook,
    scene_concept: sceneConcept,
    motion_language: motionLanguage || null,
    memory_line: memoryLine,
    proof: proof.value,
    human: human.value,
    platform: platform.value,
    attack_2000: buildAttack2000Plan(),
    doctrine: Object.freeze({
      allure_before_explanation: true,
      truth_before_claim: true,
      proof_embedded_in_scene_not_used_as_the_scene: true,
      literal_dashboard_as_default: false,
      generic_ai_art_as_default: false,
    }),
  });
}

function evaluateVisualWonderArtifact(input = {}) {
  const errors = [];
  const checks = input.checks && typeof input.checks === 'object' ? input.checks : {};
  for (const gate of HARD_ARTIFACT_GATES) {
    if (checks[gate] !== true) errors.push(`artifact hard gate failed: ${gate}`);
  }
  let softPasses = 0;
  for (const gate of SOFT_ARTIFACT_GATES) {
    if (checks[gate] === true) softPasses += 1;
  }
  if (softPasses < 6) errors.push(`artifact allure gate failed: only ${softPasses}/${SOFT_ARTIFACT_GATES.length} soft gates passed`);
  if (checks.ai_slop_tells === true) errors.push('artifact contains unresolved AI-slop tells');
  if (checks.proof_overclaim === true) errors.push('artifact visually overclaims its proof');
  if (checks.text_legibility !== true) errors.push('artifact text legibility is not proven');
  if (errors.length > 0) fail(errors);

  return Object.freeze({
    version: 1,
    kind: 'juss/visual-wonder-artifact-verdict',
    state: 'PASSED',
    soft_passes: softPasses,
    hard_gates: [...HARD_ARTIFACT_GATES],
    soft_gates: [...SOFT_ARTIFACT_GATES],
    attack_2000_complete: true,
    external_test_count_claimed: false,
  });
}

module.exports = {
  buildVisualWonderBrief,
  evaluateVisualWonderArtifact,
  buildAttack2000Plan,
};
