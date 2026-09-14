'use strict';

const { createHash } = require('node:crypto');

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

const MOVING_FORMS = new Set(['short-video-9x16', 'loop-clip', 'product-surface']);
const SAFE_ZONE_FORMS = new Set(['hero-still-4x5', 'short-video-9x16', 'carousel', 'loop-clip']);
const SHA256_RE = /^[a-f0-9]{64}$/i;
const SANITIZED_RECEIPT_RE = /^receipt:[a-z0-9][a-z0-9._:/-]{2,159}$/i;
const PUBLIC_GITHUB_REPOSITORIES = new Set(['jussray/founder-control-room']);

function text(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function list(value, max = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 512)).filter(Boolean))].slice(0, max);
}

function fail(errors) {
  throw Object.assign(new Error(`VISUAL_WONDER_REJECTED: ${errors.join('; ')}`), {
    code: 'VISUAL_WONDER_REJECTED',
    details: errors,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function digestVisualWonderBrief(brief) {
  if (!brief || brief.kind !== 'juss/visual-wonder-brief') {
    fail(['brief must be a validated juss/visual-wonder-brief']);
  }
  return sha256(stableJson(brief));
}

function normalizePhrase(value) {
  return text(value, 320)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
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

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  if (match) {
    const octet = Number(match[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host)) return true;
  return false;
}

function isPublicSafeProofReference(value) {
  const candidate = text(value, 512);
  if (!candidate) return false;
  if (SANITIZED_RECEIPT_RE.test(candidate)) return true;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
  if (isPrivateHostname(url.hostname)) return false;

  if (url.hostname.toLowerCase() === 'github.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return false;
    const repository = `${parts[0]}/${parts[1]}`.toLowerCase();
    if (!PUBLIC_GITHUB_REPOSITORIES.has(repository)) return false;
    const receiptKinds = new Set(['pull', 'commit', 'actions', 'issues', 'releases']);
    if (!receiptKinds.has(parts[2])) return false;
  }

  return true;
}

function validateProof(input = {}) {
  const required = input.required !== false;
  const proofObject = text(input.proof_object, 240);
  const rawProofLinks = list(input.proof_links, 8);
  const proofLinks = rawProofLinks.filter(isPublicSafeProofReference);
  const truthBoundary = text(input.truth_boundary, 320);
  const errors = [];
  if (required && !proofObject) errors.push('proof.proof_object is required when proof is required');
  if (required && rawProofLinks.length === 0) errors.push('proof.proof_links must contain at least one public-safe receipt when proof is required');
  if (rawProofLinks.some((value) => !isPublicSafeProofReference(value))) {
    errors.push('proof.proof_links must contain only approved public HTTPS receipts or sanitized receipt references');
  }
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
  const manipulationExplicitlyFalse = input.uses_manipulative_dark_patterns === false;
  if (!humanOutcome) errors.push('human.human_outcome is required');
  if (!comprehension) errors.push('human.comprehension_goal is required');
  if (!agency) errors.push('human.preserves_human_agency must be true');
  if (!manipulationExplicitlyFalse) errors.push('human.uses_manipulative_dark_patterns must be explicitly false');
  return {
    errors,
    value: {
      human_outcome: humanOutcome || null,
      comprehension_goal: comprehension || null,
      preserves_human_agency: agency,
      uses_manipulative_dark_patterns: false,
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

function validateCanon(input = {}, mode) {
  if (mode !== 'character-story') return { errors: [], value: null };
  const profileId = text(input.profile_id, 160);
  const profileSha256 = text(input.profile_sha256, 64).toLowerCase();
  const conceptStageVerdict = text(input.concept_stage_verdict, 32).toUpperCase();
  const errors = [];
  if (!profileId) errors.push('canon.profile_id is required for character-story');
  if (!SHA256_RE.test(profileSha256)) errors.push('canon.profile_sha256 must bind the exact character canon');
  if (conceptStageVerdict !== 'PASSED') {
    errors.push('canon.concept_stage_verdict must be PASSED before character-story generation');
  }
  return {
    errors,
    value: {
      profile_id: profileId || null,
      profile_sha256: SHA256_RE.test(profileSha256) ? profileSha256 : null,
      concept_stage_verdict: conceptStageVerdict || null,
    },
  };
}

function buildAttack2000Plan() {
  return deepFreeze({
    version: 1,
    kind: 'juss/attack-2000-visual-plan',
    reasoning_pressure_budget: 2000,
    external_test_count_claimed: false,
    pass_1_concept_attack: [
      'premise',
      'literalism',
      'visual-curiosity-gap',
      'emotional-pull',
      'proof-fit',
      'human-outcome',
      'platform-native-form',
      'brand-and-canon-fit',
    ],
    pass_2_artifact_attack: [
      ...HARD_ARTIFACT_GATES,
      ...SOFT_ARTIFACT_GATES,
      'safe-zones',
      'reduced-motion-when-applicable',
      'text-legibility',
      'ai-slop-tells',
      'proof-overclaim',
    ],
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

  if (MOVING_FORMS.has(form) && !motionLanguage) {
    errors.push('motion_language is required for moving or interactive forms');
  }

  const proof = validateProof(input.proof);
  const human = validateHumanOutput(input.human);
  const platform = validatePlatform(input.platform, form);
  const canon = validateCanon(input.canon, mode);
  errors.push(...proof.errors, ...human.errors, ...platform.errors, ...canon.errors);
  if (errors.length > 0) fail(errors);

  return deepFreeze({
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
    canon: canon.value,
    attack_2000: buildAttack2000Plan(),
    doctrine: {
      allure_before_explanation: true,
      truth_before_claim: true,
      proof_embedded_in_scene_not_used_as_the_scene: true,
      literal_dashboard_as_default: false,
      generic_ai_art_as_default: false,
    },
  });
}

function contextualGateSatisfied(value) {
  return value === true || value === 'NOT_APPLICABLE';
}

function evaluateVisualWonderArtifact(input = {}) {
  const errors = [];
  const checks = input.checks && typeof input.checks === 'object' ? input.checks : {};
  const brief = input.brief;
  let briefSha256 = null;

  try {
    briefSha256 = digestVisualWonderBrief(brief);
  } catch (error) {
    errors.push(...(error.details || ['brief must be a validated juss/visual-wonder-brief']));
  }

  const originatingBriefSha256 = text(input.originating_brief_sha256, 64).toLowerCase();
  if (!SHA256_RE.test(originatingBriefSha256)) {
    errors.push('originating_brief_sha256 must be a SHA-256 digest');
  } else if (briefSha256 && originatingBriefSha256 !== briefSha256) {
    errors.push('originating_brief_sha256 does not match the evaluated brief');
  }

  const artifact = input.rendered_artifact && typeof input.rendered_artifact === 'object'
    ? input.rendered_artifact
    : {};
  const renderedArtifactId = text(artifact.id, 240);
  const renderedArtifactSha256 = text(artifact.sha256, 64).toLowerCase();
  if (!renderedArtifactId) errors.push('rendered_artifact.id is required');
  if (!SHA256_RE.test(renderedArtifactSha256)) {
    errors.push('rendered_artifact.sha256 must be a SHA-256 digest');
  }

  for (const gate of HARD_ARTIFACT_GATES) {
    if (checks[gate] !== true) errors.push(`artifact hard gate failed: ${gate}`);
  }

  if (checks.beauty !== true) errors.push('artifact defining quality failed: beauty');
  if (checks.wonder !== true) errors.push('artifact defining quality failed: wonder');

  let softPasses = 0;
  for (const gate of SOFT_ARTIFACT_GATES) {
    if (checks[gate] === true) softPasses += 1;
  }
  if (softPasses < 6) {
    errors.push(`artifact allure gate failed: only ${softPasses}/${SOFT_ARTIFACT_GATES.length} soft gates passed`);
  }

  const form = brief && brief.form;
  if (SAFE_ZONE_FORMS.has(form)) {
    if (checks.safe_zones !== true) errors.push('artifact safe-zone evidence is required for this form');
  } else if (!contextualGateSatisfied(checks.safe_zones)) {
    errors.push('artifact safe-zone gate must explicitly pass or be NOT_APPLICABLE');
  }

  if (MOVING_FORMS.has(form)) {
    if (checks.reduced_motion !== true) errors.push('artifact reduced-motion evidence is required for moving media');
  } else if (!contextualGateSatisfied(checks.reduced_motion)) {
    errors.push('artifact reduced-motion gate must explicitly pass or be NOT_APPLICABLE');
  }

  if (checks.ai_slop_tells === true) errors.push('artifact contains unresolved AI-slop tells');
  if (checks.proof_overclaim === true) errors.push('artifact visually overclaims its proof');
  if (checks.text_legibility !== true) errors.push('artifact text legibility is not proven');
  if (errors.length > 0) fail(errors);

  return deepFreeze({
    version: 1,
    kind: 'juss/visual-wonder-artifact-verdict',
    state: 'PASSED',
    originating_brief_sha256: briefSha256,
    rendered_artifact: {
      id: renderedArtifactId,
      sha256: renderedArtifactSha256,
    },
    soft_passes: softPasses,
    hard_gates: [...HARD_ARTIFACT_GATES],
    soft_gates: [...SOFT_ARTIFACT_GATES],
    contextual_gates: {
      safe_zones: checks.safe_zones,
      reduced_motion: checks.reduced_motion,
    },
    attack_2000_complete: true,
    external_test_count_claimed: false,
  });
}

module.exports = {
  buildVisualWonderBrief,
  evaluateVisualWonderArtifact,
  buildAttack2000Plan,
  digestVisualWonderBrief,
};
