import { describe, expect, it } from 'vitest';

import { mediaFingerprint, type MediaRoutingRequestV1 } from '../mediaRouter.js';
import {
  VISUAL_GRAMMAR_MODES,
  bindVisualGrammarToMediaRoutingRequest,
  createVisualGrammarSelectionV1,
  inferVisualGrammarMode,
  validateVisualGrammarSelectionV1,
} from '../mediaVisualGrammar.js';

function request(type: 'image' | 'video'): MediaRoutingRequestV1 {
  return {
    requestId: 'request-visual-1',
    correlationId: 'corr-visual-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    requestedBy: 'founder',
    type,
    intent: 'generate',
    goal: 'production',
    prompt: 'Explain the system clearly.',
    referenceAssetIds: [],
    referencePolicy: {
      maySendToExternalProvider: false,
      mayStoreInLibrary: true,
      mayReuseCrossProject: false,
    },
    output: type === 'video' ? { aspectRatio: '16:9', durationSeconds: 20 } : { aspectRatio: '4:5' },
    constraints: {
      needsTextAccuracy: true,
      needsBrandConsistency: true,
    },
    budget: {
      mode: 'balanced',
      maxCostUsd: 5,
      allowWrapper: false,
      requireDirectProviderWhenAvailable: true,
    },
    authority: { action: 'media.generate' },
  };
}

describe('Media Visual Grammar v1', () => {
  it('keeps the canonical fourteen visual structures exact', () => {
    expect(VISUAL_GRAMMAR_MODES).toEqual([
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
    ]);
  });

  it('infers the smallest useful structure and allows no forced structure', () => {
    expect(inferVisualGrammarMode('Compare three launch options and decide which tradeoff wins.')).toBe('decision_matrix');
    expect(inferVisualGrammarMode('Show the product history and what changed over time.')).toBe('timeline');
    expect(inferVisualGrammarMode('Create a cinematic portrait with dramatic lighting.')).toBeNull();
  });

  it('uses image composition for stills and reveal grammar for video', () => {
    const image = createVisualGrammarSelectionV1({
      assetKind: 'image',
      viewerJob: 'Explain the hidden causes beneath the visible problem.',
      primaryMode: 'iceberg',
    });
    const video = createVisualGrammarSelectionV1({
      assetKind: 'video',
      viewerJob: 'Show how the product is assembled from its parts.',
      primaryMode: 'exploded_view',
    });

    expect(image.imageComposition).toMatch(/visible-above/i);
    expect(image.videoReveal).toBeNull();
    expect(video.videoReveal).toMatch(/Disassemble/i);
    expect(video.imageComposition).toBeNull();
  });

  it('permits only one distinct supporting structure with an explicit job', () => {
    expect(() => createVisualGrammarSelectionV1({
      assetKind: 'image',
      viewerJob: 'Compare two systems and show their hierarchy.',
      primaryMode: 'decision_matrix',
      supportingMode: 'decision_matrix',
      supportingRationale: 'Repeat it.',
    })).toThrow(/distinct/);

    expect(() => createVisualGrammarSelectionV1({
      assetKind: 'image',
      viewerJob: 'Compare two systems and show their hierarchy.',
      primaryMode: 'decision_matrix',
      supportingMode: 'tree',
    })).toThrow(/supportingRationale/);

    const selection = createVisualGrammarSelectionV1({
      assetKind: 'image',
      viewerJob: 'Compare two systems and show their hierarchy.',
      primaryMode: 'decision_matrix',
      supportingMode: 'tree',
      supportingRationale: 'The matrix makes the choice legible; the tree only explains ownership hierarchy.',
    });
    expect(selection.supportingMode).toBe('tree');
  });

  it('never converts structure into truth, rights, release, or publication authority', () => {
    const selection = createVisualGrammarSelectionV1({
      assetKind: 'video',
      viewerJob: 'Explain a recurring feedback loop.',
      primaryMode: 'cycle',
      sourceProtocol: 'MAKEVIDEO',
      sourceRecordId: 'shot-plan-22',
    });

    expect(selection.structureGrantsTruthOrAuthority).toBe(false);
    expect(validateVisualGrammarSelectionV1(selection)).toEqual([]);
    expect(validateVisualGrammarSelectionV1({
      ...selection,
      structureGrantsTruthOrAuthority: true as false,
    })).toContain('visual structure cannot grant truth or authority');
  });

  it('binds visual grammar into Media Router request identity without changing router authority', () => {
    const base = request('image');
    const matrix = bindVisualGrammarToMediaRoutingRequest(base, createVisualGrammarSelectionV1({
      assetKind: 'image',
      viewerJob: 'Compare two launch choices.',
      primaryMode: 'decision_matrix',
    }));
    const infographic = bindVisualGrammarToMediaRoutingRequest(base, createVisualGrammarSelectionV1({
      assetKind: 'image',
      viewerJob: 'Summarize the launch evidence.',
      primaryMode: 'infographic',
    }));

    expect(mediaFingerprint(matrix)).not.toBe(mediaFingerprint(infographic));
    expect(matrix.authority.action).toBe('media.generate');
  });

  it('rejects image/video binding mismatches and tampered continuity fingerprints', () => {
    const selection = createVisualGrammarSelectionV1({
      assetKind: 'video',
      viewerJob: 'Reveal milestones in order.',
      primaryMode: 'roadmap',
    });

    expect(() => bindVisualGrammarToMediaRoutingRequest(request('image'), selection)).toThrow(/cannot bind/);
    expect(validateVisualGrammarSelectionV1({ ...selection, rationale: 'silently changed' })).toContain('visual grammar fingerprint mismatch');
  });
});
