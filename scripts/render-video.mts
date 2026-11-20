import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { renderFfmpegTimelineV1 } from '../src/lib/mediaFfmpegRender.js';

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function resolveSpecPaths(spec: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(spec);
  if (typeof next.fontFile === 'string') next.fontFile = resolve(next.fontFile);
  if (typeof next.fontFileBold === 'string') next.fontFileBold = resolve(next.fontFileBold);
  if (Array.isArray(next.segments)) {
    next.segments = next.segments.map((segment) => {
      if (!segment || typeof segment !== 'object') return segment;
      const copy = { ...(segment as Record<string, unknown>) };
      if (typeof copy.imagePath === 'string') copy.imagePath = resolve(copy.imagePath);
      return copy;
    });
  }
  return next;
}

const inputPath = arg('--input');
const outputPath = arg('--output');
if (!inputPath || !outputPath) {
  console.error('Usage: npx tsx scripts/render-video.mts --input <timeline.json> --output <video.mp4>');
  process.exit(1);
}

try {
  const raw = JSON.parse(await readFile(resolve(inputPath), 'utf8')) as Record<string, unknown>;
  const spec = resolveSpecPaths(raw);
  const result = await renderFfmpegTimelineV1(spec as never, resolve(outputPath));
  console.log(JSON.stringify(result, null, 2));
  if (result.kind !== 'RENDERED') process.exitCode = result.kind === 'CAPABILITY_UNAVAILABLE' ? 2 : 1;
} catch (error) {
  console.error(JSON.stringify({
    kind: 'FAILED',
    code: 'FCR_VIDEO_CLI_FAILED',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
