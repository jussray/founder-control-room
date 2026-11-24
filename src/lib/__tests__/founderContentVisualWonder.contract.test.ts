import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildVisualWonderBrief,
  evaluateVisualWonderArtifact,
  buildAttack2000Plan,
  digestVisualWonderBrief,
} = require('../../../tools/founder-content-contracts/visual-wonder-contract.cjs');

const baseBrief = {
  thesis: 'A failed verification can be a successful system outcome.',
  creative_mode: 'cinematic-proof',
  form: 'short-video-9x16',
  emotional_intent: ['wonder', 'revelation'],
  visual_hook: 'A glowing proof signal crosses a dark control room, then stops at an unresolved boundary instead of turning green.',
  scene_concept: 'Treat proof as a living signal moving through a vast night-time system, with the unresolved boundary becoming the dramatic event rather than a dashboard screenshot.',
  motion_language: 'Slow cinematic drift, sudden stop at the proof boundary, restrained particle bloom, then a quiet pull-back.',
  memory_line: 'Stopping correctly is a capability.',
  proof: {
    required: true,
    proof_object: 'Exact-head Playwright run and bound PR receipt',
    proof_links: ['https://github.com/jussray/founder-control-room/pull/746'],
    truth_boundary: 'The receipt proves the observed source/run state only; it does not imply production success.',
  },
  human: {
    human_outcome: 'Leave the viewer more able to distinguish execution from verification.',
    comprehension_goal: 'Understand that unresolved proof is not equivalent to task failure or success.',
    preserves_human_agency: true,
    uses_manipulative_dark_patterns: false,
  },
  platform: {
    targets: ['TikTok', 'YouTube Shorts', 'Instagram Reels'],
    duration_seconds: 12,
    native_behavior: 'Hook in the first second, proof reveal by second six, memorable close before the loop point.',
  },
};

const otherwiseGreen = {
  proof_integrity: true,
  nonliteral_interpretation: true,
  accessibility: true,
  canon_integrity: true,
  human_agency: true,
  scroll_stop: true,
  beauty: true,
  wonder: true,
  meaning: true,
  platform_native: true,
  memorability: true,
  brand_fit: true,
  uncluttered: true,
  safe_zones: true,
  reduced_motion: true,
  text_legibility: true,
  ai_slop_tells: false,
  proof_overclaim: false,
};

function artifactInput(overrides: Record<string, unknown> = {}) {
  const brief = buildVisualWonderBrief(baseBrief);
  return {
    brief,
    originating_brief_sha256: digestVisualWonderBrief(brief),
    rendered_artifact: {
      id: 'render:visual-wonder:test-001',
      sha256: 'a'.repeat(64),
    },
    checks: otherwiseGreen,
    ...overrides,
  };
}

describe('visual wonder contract', () => {
  it('forces wonder, proof, human outcome, native form, and a nonliteral scene before generation', () => {
    const brief = buildVisualWonderBrief(baseBrief);
    expect(brief.kind).toBe('juss/visual-wonder-brief');
    expect(brief.doctrine.allure_before_explanation).toBe(true);
    expect(brief.doctrine.proof_embedded_in_scene_not_used_as_the_scene).toBe(true);
    expect(brief.attack_2000.reasoning_pressure_budget).toBe(2000);
    expect(brief.attack_2000.external_test_count_claimed).toBe(false);
  });

  it('preserves Unicode letters and numbers while checking scene distinctness', () => {
    const brief = buildVisualWonderBrief({
      ...baseBrief,
      thesis: 'الحقيقة تحتاج دليلاً',
      visual_hook: 'باب من الضوء يفتح على سجل الإثبات',
      scene_concept: 'مدينة ليلية تتحول فيها الأدلة إلى جسور مضيئة',
    });
    expect(brief.scene_concept).toContain('مدينة');
  });

  it('rejects literal restatement masquerading as art direction', () => {
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      scene_concept: baseBrief.thesis,
    })).toThrow(/interpret the thesis rather than repeat it literally/);
  });

  it('rejects unsafe proof links instead of merely trimming arbitrary strings', () => {
    for (const proofLink of [
      'not-a-url',
      'http://localhost:3000/proof',
      'https://127.0.0.1/proof',
      'https://github.com/private-owner/private-repo/pull/1',
      'https://github.com/jussray/founder-control-room/pull/746?token=secret',
    ]) {
      expect(() => buildVisualWonderBrief({
        ...baseBrief,
        proof: { ...baseBrief.proof, proof_links: [proofLink] },
      })).toThrow(/approved public HTTPS receipts or sanitized receipt references/);
    }
    expect(buildVisualWonderBrief({
      ...baseBrief,
      proof: { ...baseBrief.proof, proof_links: ['receipt:fcr:playwright:746'] },
    }).proof.proof_links).toEqual(['receipt:fcr:playwright:746']);
  });

  it('rejects proof-first claims with no public-safe proof anchor', () => {
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      proof: { ...baseBrief.proof, proof_links: [] },
    })).toThrow(/proof_links must contain at least one public-safe receipt/);
  });

  it('rejects moving media with no motion language or native duration', () => {
    expect(() => buildVisualWonderBrief({ ...baseBrief, motion_language: '' })).toThrow(/motion_language is required/);
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      platform: { ...baseBrief.platform, duration_seconds: 90 },
    })).toThrow(/between 3 and 60/);
  });

  it('keeps the human-output gate explicit, non-manipulative, and agency-preserving', () => {
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      human: { ...baseBrief.human, preserves_human_agency: false },
    })).toThrow(/preserves_human_agency must be true/);
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      human: { ...baseBrief.human, uses_manipulative_dark_patterns: true },
    })).toThrow(/dark_patterns must be explicitly false/);
    const withoutAttestation: Record<string, unknown> = { ...baseBrief.human };
    delete withoutAttestation.uses_manipulative_dark_patterns;
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      human: withoutAttestation,
    })).toThrow(/dark_patterns must be explicitly false/);
  });

  it('requires a bound character canon before character-story generation', () => {
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      creative_mode: 'character-story',
    })).toThrow(/canon.profile_id is required/);

    const brief = buildVisualWonderBrief({
      ...baseBrief,
      creative_mode: 'character-story',
      canon: {
        profile_id: 'sekret-bip:night-suhana-sy:v1',
        profile_sha256: 'b'.repeat(64),
        concept_stage_verdict: 'PASSED',
      },
    });
    expect(brief.canon?.profile_id).toBe('sekret-bip:night-suhana-sy:v1');
  });

  it('deep-freezes validated nested brief state', () => {
    const brief = buildVisualWonderBrief(baseBrief);
    expect(Object.isFrozen(brief)).toBe(true);
    expect(Object.isFrozen(brief.proof)).toBe(true);
    expect(Object.isFrozen(brief.proof.proof_links)).toBe(true);
    expect(Object.isFrozen(brief.human)).toBe(true);
    expect(Object.isFrozen(brief.platform.targets)).toBe(true);
    expect(Object.isFrozen(brief.attack_2000.pass_2_artifact_attack)).toBe(true);
  });

  it('binds every artifact verdict to the exact brief and rendered artifact identity', () => {
    const input = artifactInput();
    const verdict = evaluateVisualWonderArtifact(input);
    expect(verdict.originating_brief_sha256).toBe(input.originating_brief_sha256);
    expect(verdict.rendered_artifact).toEqual(input.rendered_artifact);

    expect(() => evaluateVisualWonderArtifact({
      ...input,
      originating_brief_sha256: 'c'.repeat(64),
    })).toThrow(/does not match the evaluated brief/);

    expect(() => evaluateVisualWonderArtifact({
      ...input,
      rendered_artifact: { id: 'render:test', sha256: 'not-a-digest' },
    })).toThrow(/rendered_artifact.sha256/);
  });

  it('requires beauty and wonder even when the other six soft gates pass', () => {
    const input = artifactInput({
      checks: {
        ...otherwiseGreen,
        beauty: false,
        wonder: false,
      },
    });
    expect(() => evaluateVisualWonderArtifact(input)).toThrow(/defining quality failed: beauty/);
  });

  it('requires safe-zone and reduced-motion evidence for moving social artifacts', () => {
    const noSafeZones = artifactInput({
      checks: { ...otherwiseGreen, safe_zones: false },
    });
    expect(() => evaluateVisualWonderArtifact(noSafeZones)).toThrow(/safe-zone evidence is required/);

    const noReducedMotion = artifactInput({
      checks: { ...otherwiseGreen, reduced_motion: 'NOT_APPLICABLE' },
    });
    expect(() => evaluateVisualWonderArtifact(noReducedMotion)).toThrow(/reduced-motion evidence is required/);
  });

  it('fails the rendered artifact when beauty/wonder/native quality is too weak even if truth gates pass', () => {
    expect(() => evaluateVisualWonderArtifact(artifactInput({
      checks: {
        ...otherwiseGreen,
        beauty: false,
        wonder: false,
        platform_native: false,
        memorability: false,
      },
    }))).toThrow(/allure gate failed/);
  });

  it('rejects AI-slop tells and proof overclaim as hard artifact failures', () => {
    expect(() => evaluateVisualWonderArtifact(artifactInput({
      checks: { ...otherwiseGreen, ai_slop_tells: true },
    }))).toThrow(/AI-slop/);
    expect(() => evaluateVisualWonderArtifact(artifactInput({
      checks: { ...otherwiseGreen, proof_overclaim: true },
    }))).toThrow(/overclaims/);
    expect(evaluateVisualWonderArtifact(artifactInput()).state).toBe('PASSED');
  });

  it('defines Attack 2000 as two falsification passes rather than pretending 2,000 external tests ran', () => {
    const plan = buildAttack2000Plan();
    expect(plan.pass_1_concept_attack).toContain('literalism');
    expect(plan.pass_2_artifact_attack).toContain('ai-slop-tells');
    expect(plan.external_test_count_claimed).toBe(false);
  });
});
