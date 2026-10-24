import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  await readFile(new URL('../../../.control-room/plugin-management.json', import.meta.url), 'utf8'),
);

const leevize = manifest.youtubeProductionTruth?.leevize;

describe('LEEVIZE open-source video production contract', () => {
  it('keeps Shot DNA provider-neutral and open-source-first without laundering authority', () => {
    expect(leevize).toMatchObject({
      workflow: 'LEEVIZE',
      shotContract: 'shot-dna@v1',
      openSourceFirst: true,
      candidateAvailabilityIsRuntimeFact: true,
      openSourceLabelDoesNotProveLicenseOrCommercialUse: true,
      unknownLicenseClassifyAs: 'BLOCKED_LICENSE_REVIEW',
      rendererAdaptersReplaceable: true,
      generatedUiMayProveProductBehavior: false,
      realProductCaptureRequiresPlaywright: true,
      finalAudioPrecedesCaptionTiming: true,
    });
    expect(leevize.deterministicPostTools).toEqual(['ffmpeg', 'ffprobe']);
    expect(leevize.productionWorkflow).toEqual([
      'intent-and-proof',
      'director-brief',
      'model-neutral-shot-spec',
      'renderer-adapter',
      'generate-or-capture',
      'deterministic-post',
      'final-audio',
      'caption-from-final-audio',
      'media-probe',
      'playwright-product-proof-if-applicable',
      'attack6000',
      'review-final-asset',
    ]);
    expect(leevize.authorityRule).toMatch(/routing preference, never production authority/i);
  });

  it('binds ATTACK6000 to failure-class discovery rather than a fake test-count claim', () => {
    expect(leevize.attack6000.reasoningPressureBudget).toBe(6000);
    expect(leevize.attack6000.externalTestCountClaimed).toBe(false);
    expect(leevize.attack6000.deduplicateFailureClasses).toBe(true);
    for (const family of ['story', 'continuity', 'product-truth', 'audio', 'captions', 'provenance', 'release']) {
      expect(leevize.attack6000.families).toContain(family);
    }
  });

  it('keeps release truth explicit', () => {
    expect(leevize.releaseGate).toEqual([
      'story',
      'continuity',
      'product-truth',
      'audio',
      'captions',
      'brand',
      'platform',
      'provenance',
      'evidence',
    ]);
  });
});
