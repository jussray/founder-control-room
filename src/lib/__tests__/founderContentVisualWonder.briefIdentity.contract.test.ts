import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildVisualWonderBrief,
  digestVisualWonderBrief,
  evaluateVisualWonderArtifact,
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

const greenChecks = {
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

describe('visual wonder brief identity boundary', () => {
  it('rejects forged derived state even when the object claims the validated brief kind', () => {
    const valid = buildVisualWonderBrief(baseBrief);
    const forged = {
      ...valid,
      doctrine: {
        ...valid.doctrine,
        truth_before_claim: false,
      },
    };

    expect(() => digestVisualWonderBrief(forged)).toThrow(/exactly match canonical validated/);
    expect(() => evaluateVisualWonderArtifact({
      brief: forged,
      originating_brief_sha256: 'd'.repeat(64),
      rendered_artifact: {
        id: 'render:visual-wonder:forged-brief',
        sha256: 'a'.repeat(64),
      },
      checks: greenChecks,
    })).toThrow(/exactly match canonical validated/);
  });
});
