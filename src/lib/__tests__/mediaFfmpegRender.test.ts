import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FFMPEG_RENDER_CONTRACT,
  FFMPEG_RENDER_EXECUTION_SCOPE,
  buildFfmpegArgs,
  probeFfmpegBinary,
  renderFfmpegTimelineV1,
  validateTimelineSpec,
  wrapText,
  type FfmpegTimelineSpec,
} from '../mediaFfmpegRender.js';

const baseSpec: FfmpegTimelineSpec = {
  width: 320,
  height: 180,
  fps: 24,
  frameColor: '#d4af37',
  segments: [
    { durationSec: 1, background: '#6d28d9', lines: [{ text: 'Max length under $150', sizeFrac: 0.1, yFrac: 0.5, color: '#ffffff' }] },
    { durationSec: 1, background: '#4c1d95', lines: [{ text: '3 bundles = 300g', sizeFrac: 0.1, yFrac: 0.5, color: '#d4af37' }] },
  ],
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('ffmpeg render adapter', () => {
  it('rejects unsafe or malformed specs before touching ffmpeg', () => {
    expect(validateTimelineSpec({ ...baseSpec, width: 321 })).toMatch(/even/);
    expect(validateTimelineSpec({ ...baseSpec, fps: 5 })).toMatch(/fps/);
    expect(validateTimelineSpec({ ...baseSpec, segments: [] })).toMatch(/segments/);
    expect(validateTimelineSpec({ ...baseSpec, edgeFadeSec: 6 })).toMatch(/edgeFadeSec/);
    expect(
      validateTimelineSpec({
        ...baseSpec,
        width: 3840,
        height: 3840,
        fps: 60,
        segments: Array.from({ length: 4 }, () => ({ durationSec: 30, background: '#000000', lines: [] })),
      }),
    ).toMatch(/render-work ceiling/);
    expect(
      validateTimelineSpec({
        ...baseSpec,
        segments: [{ durationSec: 1, background: '#000000', lines: Array.from({ length: 13 }, (_, i) => ({ text: `line ${i}`, sizeFrac: 0.1, yFrac: 0.5, color: '#ffffff' })) }],
      }),
    ).toMatch(/lines/);
    expect(
      validateTimelineSpec({ ...baseSpec, segments: [{ durationSec: 1, background: 'red', lines: [] }] }),
    ).toMatch(/background/);
    expect(
      validateTimelineSpec({
        ...baseSpec,
        segments: [{ durationSec: 1, background: '#000000', lines: [{ text: 'x', sizeFrac: 0.1, yFrac: 0.5, color: '#fff' }] }],
      }),
    ).toMatch(/color/);
    expect(
      validateTimelineSpec({
        ...baseSpec,
        segments: [{ durationSec: 1, background: '#000000', imagePath: 'relative/photo.png', lines: [] }],
      }),
    ).toMatch(/imagePath/);
    expect(validateTimelineSpec(baseSpec)).toBeNull();
  });

  it('keeps user text out of the filter graph and rejects unsafe filter paths', () => {
    const args = buildFfmpegArgs(
      { ...baseSpec, segments: [{ durationSec: 1, background: '#000000', lines: [{ text: "x':y;[evil]", sizeFrac: 0.1, yFrac: 0.5, color: '#ffffff' }] }] },
      { outputPath: '/tmp/out.mp4', textFiles: [['/tmp/t-0-0.txt']], fontRegular: '/f.ttf', fontBold: '/fb.ttf' },
    );
    const graph = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(graph).toContain("textfile='/tmp/t-0-0.txt'");
    expect(graph).not.toContain('evil');
    expect(() => buildFfmpegArgs(baseSpec, {
      outputPath: '/tmp/out.mp4',
      textFiles: [['/tmp/t-0-0.txt'], ['/tmp/t-1-0.txt']],
      fontRegular: "/tmp/f'ont.ttf",
      fontBold: '/tmp/fb.ttf',
    })).toThrow(/unsupported filter-graph path characters/);
  });

  it('wraps text on word boundaries', () => {
    expect(wrapText('one two three four', 9)).toBe('one two\nthree\nfour');
  });

  it('requires the real ffmpeg/ffprobe capability and renders a probed MP4 with bound provenance', async () => {
    const binary = await probeFfmpegBinary();
    expect(binary.available).toBe(true);
    expect(binary.version).toBeTruthy();

    const dir = await mkdtemp(join(tmpdir(), 'fcr-ffmpeg-test-'));
    try {
      const image = join(dir, 'source.ppm');
      const ppmA = 'P3\n2 2\n255\n255 0 0  0 255 0\n0 0 255  255 255 0\n';
      await writeFile(image, ppmA, 'utf8');
      const spec: FfmpegTimelineSpec = {
        ...baseSpec,
        segments: [
          { ...baseSpec.segments[0], imagePath: image },
          baseSpec.segments[1],
        ],
        audio: { kind: 'synth-bed', bpm: 90, gain: 0.4 },
      };

      const outA = join(dir, 'out-a.mp4');
      const resultA = await renderFfmpegTimelineV1(spec, outA);
      expect(resultA.kind).toBe('RENDERED');
      if (resultA.kind !== 'RENDERED') return;

      expect(resultA.contract).toBe(FFMPEG_RENDER_CONTRACT);
      expect(resultA.executionScope).toBe(FFMPEG_RENDER_EXECUTION_SCOPE);
      expect(resultA.motionClass).toBe('GRAPHIC_ANIMATION');
      expect(resultA.publishAuthority).toBe(false);
      expect(resultA.truthAuthority).toBe(false);
      expect(resultA.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(resultA.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(resultA.sourceAssets).toEqual([{ segmentIndex: 0, sha256: sha256(ppmA), bytes: Buffer.byteLength(ppmA) }]);
      expect(resultA.fonts.regularSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(resultA.fonts.boldSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(resultA.probe.width).toBe(320);
      expect(resultA.probe.height).toBe(180);
      expect(resultA.probe.videoCodec).toBe('h264');
      expect(resultA.probe.audioCodec).toBe('aac');
      expect(resultA.probe.durationSec).toBeGreaterThan(1.8);
      expect(resultA.probe.durationSec).toBeLessThan(2.3);
      expect(resultA.probe.frameCount).toBe(48);

      const collision = await renderFfmpegTimelineV1({ ...spec, segments: [{ ...spec.segments[0], imagePath: outA }, spec.segments[1]] }, outA);
      expect(collision.kind).toBe('REJECTED');

      const ppmB = 'P3\n2 2\n255\n0 0 0  0 255 0\n0 0 255  255 255 0\n';
      await writeFile(image, ppmB, 'utf8');
      const outB = join(dir, 'out-b.mp4');
      const resultB = await renderFfmpegTimelineV1(spec, outB);
      expect(resultB.kind).toBe('RENDERED');
      if (resultB.kind !== 'RENDERED') return;
      expect(resultB.sourceAssets[0]?.sha256).toBe(sha256(ppmB));
      expect(resultB.inputFingerprint).not.toBe(resultA.inputFingerprint);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('returns REJECTED for a bad output path before capability probing', async () => {
    const result = await renderFfmpegTimelineV1(baseSpec, 'relative.mp4');
    expect(result.kind).toBe('REJECTED');
  });
});
