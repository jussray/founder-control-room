import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildVisualWonderBrief,
  evaluateVisualWonderArtifact,
  buildAttack2000Plan,
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

describe('visual wonder contract', () => {
  it('forces wonder, proof, human outcome, native form, and a nonliteral scene before generation', () => {
    const brief = buildVisualWonderBrief(baseBrief);
    expect(brief.kind).toBe('juss/visual-wonder-brief');
    expect(brief.doctrine.allure_before_explanation).toBe(true);
    expect(brief.doctrine.proof_embedded_in_scene_not_used_as_the_scene).toBe(true);
    expect(brief.attack_2000.reasoning_pressure_budget).toBe(2000);
    expect(brief.attack_2000.external_test_count_claimed).toBe(false);
  });

  it('rejects literal restatement masquerading as art direction', () => {
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      scene_concept: baseBrief.thesis,
    })).toThrow(/interpret the thesis rather than repeat it literally/);
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

  it('keeps the human-output gate non-manipulative and agency-preserving', () => {
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      human: { ...baseBrief.human, preserves_human_agency: false },
    })).toThrow(/preserves_human_agency must be true/);
    expect(() => buildVisualWonderBrief({
      ...baseBrief,
      human: { ...baseBrief.human, uses_manipulative_dark_patterns: true },
    })).toThrow(/dark_patterns must be false/);
  });

  it('fails the rendered artifact when beauty/wonder/native quality is too weak even if truth gates pass', () => {
    expect(() => evaluateVisualWonderArtifact({
      checks: {
        proof_integrity: true,
        nonliteral_interpretation: true,
        accessibility: true,
        canon_integrity: true,
        human_agency: true,
        scroll_stop: true,
        beauty: false,
        wonder: false,
        meaning: true,
        platform_native: false,
        memorability: false,
        brand_fit: true,
        uncluttered: true,
        text_legibility: true,
        ai_slop_tells: false,
        proof_overclaim: false,
      },
    })).toThrow(/allure gate failed/);
  });

  it('rejects AI-slop tells and proof overclaim as hard artifact failures', () => {
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
      text_legibility: true,
      ai_slop_tells: false,
      proof_overclaim: false,
    };
    expect(() => evaluateVisualWonderArtifact({ checks: { ...otherwiseGreen, ai_slop_tells: true } })).toThrow(/AI-slop/);
    expect(() => evaluateVisualWonderArtifact({ checks: { ...otherwiseGreen, proof_overclaim: true } })).toThrow(/overclaims/);
    expect(evaluateVisualWonderArtifact({ checks: otherwiseGreen }).state).toBe('PASSED');
  });

  it('defines Attack 2000 as two falsification passes rather than pretending 2,000 external tests ran', () => {
    const plan = buildAttack2000Plan();
    expect(plan.pass_1_concept_attack).toContain('literalism');
    expect(plan.pass_2_artifact_attack).toContain('ai-slop-tells');
    expect(plan.external_test_count_claimed).toBe(false);
  });
});
