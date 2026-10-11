import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, lstat, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join } from 'node:path';

/**
 * First-party local-process post adapter (ffmpeg).
 *
 * Renders declared graphic timelines into MP4 files. A successful result binds
 * the declared timeline, snapshotted source/font bytes, renderer contract, and
 * observed ffmpeg/ffprobe toolchain to an input fingerprint, then binds the
 * rendered bytes to a sha256 digest plus fail-closed ffprobe readback.
 *
 * Runtime scope is intentionally LOCAL_PROCESS: Cloudflare Worker code cannot
 * execute child processes. Router/runtime wiring is a separate gate. This
 * adapter grants no truth, release, or publication authority.
 */

export const FFMPEG_RENDER_CONTRACT = 'founder-control-room/ffmpeg-render@v1' as const;
export const FFMPEG_RENDER_EXECUTION_SCOPE = 'LOCAL_PROCESS' as const;

export interface FfmpegTextLine {
  text: string;
  /** Font size as a fraction of min(width, height). */
  sizeFrac: number;
  /** Vertical centre as a fraction of height (0..1). */
  yFrac: number;
  color: string;
  bold?: boolean;
}

export interface FfmpegSegment {
  durationSec: number;
  background: string;
  /** Optional absolute path to a real still, fitted inside the frame above the background. */
  imagePath?: string;
  lines: readonly FfmpegTextLine[];
}

export interface FfmpegSynthBed {
  kind: 'synth-bed';
  bpm: number;
  /** 0..1 */
  gain: number;
}

export interface FfmpegTimelineSpec {
  width: number;
  height: number;
  fps: number;
  segments: readonly FfmpegSegment[];
  frameColor?: string;
  edgeFadeSec?: number;
  audio?: FfmpegSynthBed;
  fontFile?: string;
  fontFileBold?: string;
}

export interface FfmpegProbeSummary {
  width: number;
  height: number;
  durationSec: number;
  videoCodec: string;
  audioCodec: string | null;
  frameCount: number | null;
}

export interface FfmpegSourceAssetFingerprint {
  segmentIndex: number;
  sha256: string;
  bytes: number;
}

export interface FfmpegFontFingerprints {
  regularSha256: string;
  boldSha256: string;
}

export interface FfmpegToolchainProbe {
  available: boolean;
  version: string | null;
  ffprobeVersion: string | null;
}

export type FfmpegRenderResult =
  | {
      kind: 'RENDERED';
      contract: typeof FFMPEG_RENDER_CONTRACT;
      executionScope: typeof FFMPEG_RENDER_EXECUTION_SCOPE;
      outputPath: string;
      sha256: string;
      bytes: number;
      inputFingerprint: string;
      sourceAssets: readonly FfmpegSourceAssetFingerprint[];
      fonts: FfmpegFontFingerprints;
      ffmpegVersion: string;
      ffprobeVersion: string;
      probe: FfmpegProbeSummary;
      motionClass: 'GRAPHIC_ANIMATION';
      truthAuthority: false;
      publishAuthority: false;
    }
  | { kind: 'CAPABILITY_UNAVAILABLE'; reason: string }
  | { kind: 'REJECTED'; reason: string }
  | { kind: 'FAILED'; code: string; safeMessage: string };

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_TOTAL_SEC = 120;
const MAX_TEXT = 200;
const MAX_SEGMENTS = 40;
const MAX_LINES_PER_SEGMENT = 12;
const MAX_EDGE_FADE_SEC = 5;
const MAX_PIXEL_FRAMES = 1920 * 1080 * 60 * 120;
const FILTER_SAFE_PATH = /^\/[A-Za-z0-9_./ -]+$/;
const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/Library/Fonts/Arial.ttf',
];
const FONT_BOLD_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/Library/Fonts/Arial Bold.ttf',
];

function run(cmd: string, args: readonly string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, [...args], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error
        ? (typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : 1)
        : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  throw new TypeError(`canonical JSON does not support ${typeof value}`);
}

export async function probeFfmpegBinary(): Promise<FfmpegToolchainProbe> {
  const ffmpeg = await run('ffmpeg', ['-version'], 10_000);
  if (ffmpeg.code !== 0) return { available: false, version: null, ffprobeVersion: null };
  const ffprobe = await run('ffprobe', ['-version'], 10_000);
  if (ffprobe.code !== 0) return { available: false, version: null, ffprobeVersion: null };
  const ffmpegMatch = /ffmpeg version (\S+)/.exec(ffmpeg.stdout);
  const ffprobeMatch = /ffprobe version (\S+)/.exec(ffprobe.stdout);
  return {
    available: true,
    version: ffmpegMatch?.[1] ?? 'unknown',
    ffprobeVersion: ffprobeMatch?.[1] ?? 'unknown',
  };
}

function splitLongWord(word: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < word.length; i += maxChars) chunks.push(word.slice(i, i + maxChars));
  return chunks;
}

export function wrapText(text: string, maxChars: number): string {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error('maxChars must be a positive integer');
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => word.length > maxChars ? splitLongWord(word, maxChars) : [word]);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

export function validateTimelineSpec(spec: FfmpegTimelineSpec): string | null {
  if (!Number.isInteger(spec.width) || !Number.isInteger(spec.height) || spec.width < 160 || spec.height < 160 || spec.width > 3840 || spec.height > 3840) {
    return 'width/height must be integers between 160 and 3840';
  }
  if (spec.width % 2 !== 0 || spec.height % 2 !== 0) return 'width/height must be even (yuv420p)';
  if (!Number.isInteger(spec.fps) || spec.fps < 12 || spec.fps > 60) return 'fps must be an integer between 12 and 60';
  if (spec.segments.length < 1 || spec.segments.length > MAX_SEGMENTS) return `segments must be 1..${MAX_SEGMENTS}`;
  if (spec.edgeFadeSec !== undefined && (!Number.isFinite(spec.edgeFadeSec) || spec.edgeFadeSec < 0 || spec.edgeFadeSec > MAX_EDGE_FADE_SEC)) {
    return `edgeFadeSec must be 0..${MAX_EDGE_FADE_SEC}`;
  }
  if (spec.fontFile !== undefined && (!isAbsolute(spec.fontFile) || !existsSync(spec.fontFile))) return 'fontFile must be an existing absolute path';
  if (spec.fontFileBold !== undefined && (!isAbsolute(spec.fontFileBold) || !existsSync(spec.fontFileBold))) return 'fontFileBold must be an existing absolute path';

  let total = 0;
  for (const [i, seg] of spec.segments.entries()) {
    if (!Number.isFinite(seg.durationSec) || !(seg.durationSec > 0) || seg.durationSec > 30) return `segment ${i}: durationSec must be >0 and <=30`;
    total += seg.durationSec;
    if (!HEX.test(seg.background)) return `segment ${i}: background must be #rrggbb`;
    if (seg.imagePath !== undefined && (!isAbsolute(seg.imagePath) || !existsSync(seg.imagePath))) return `segment ${i}: imagePath must be an existing absolute path`;
    if (seg.lines.length > MAX_LINES_PER_SEGMENT) return `segment ${i}: lines must be 0..${MAX_LINES_PER_SEGMENT}`;
    for (const [j, line] of seg.lines.entries()) {
      if (!line.text.trim() || line.text.length > MAX_TEXT) return `segment ${i} line ${j}: text must be 1..${MAX_TEXT} chars`;
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u0008\u000b-\u001f]/.test(line.text)) return `segment ${i} line ${j}: control characters not allowed`;
      if (!HEX.test(line.color)) return `segment ${i} line ${j}: color must be #rrggbb`;
      if (!Number.isFinite(line.sizeFrac) || !(line.sizeFrac > 0.01 && line.sizeFrac < 0.4)) return `segment ${i} line ${j}: sizeFrac must be between 0.01 and 0.4`;
      if (!Number.isFinite(line.yFrac) || !(line.yFrac >= 0 && line.yFrac <= 1)) return `segment ${i} line ${j}: yFrac must be 0..1`;
    }
  }
  if (total > MAX_TOTAL_SEC) return `total duration must be <= ${MAX_TOTAL_SEC}s`;
  if (spec.width * spec.height * spec.fps * total > MAX_PIXEL_FRAMES) return 'timeline exceeds the bounded local render-work ceiling';
  if (spec.frameColor !== undefined && !HEX.test(spec.frameColor)) return 'frameColor must be #rrggbb';
  if (spec.audio && (
    !Number.isFinite(spec.audio.bpm)
    || !Number.isFinite(spec.audio.gain)
    || !(spec.audio.bpm >= 60 && spec.audio.bpm <= 160)
    || !(spec.audio.gain > 0 && spec.audio.gain <= 1)
  )) {
    return 'audio.bpm must be 60..160 and audio.gain 0..1';
  }
  return null;
}

function firstExisting(paths: readonly string[]): string | null {
  return paths.find((path) => existsSync(path)) ?? null;
}

const ff = (hex: string): string => `0x${hex.slice(1)}`;

function assertFilterSafePath(path: string, label: string): void {
  if (!FILTER_SAFE_PATH.test(path)) throw new Error(`${label} contains unsupported filter-graph path characters`);
}

/** Pure: builds the ffmpeg argument vector. User text is passed by file only. */
export function buildFfmpegArgs(
  spec: FfmpegTimelineSpec,
  ctx: { outputPath: string; textFiles: readonly (readonly string[])[]; fontRegular: string; fontBold: string },
): string[] {
  assertFilterSafePath(ctx.fontRegular, 'fontRegular');
  assertFilterSafePath(ctx.fontBold, 'fontBold');
  for (const [i, files] of ctx.textFiles.entries()) {
    for (const [j, file] of files.entries()) assertFilterSafePath(file, `textFiles[${i}][${j}]`);
  }

  const { width: w, height: h, fps } = spec;
  const edge = spec.edgeFadeSec ?? 0.25;
  const args: string[] = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error'];
  const chains: string[] = [];
  const total = spec.segments.reduce((sum, seg) => sum + seg.durationSec, 0);

  spec.segments.forEach((seg) => {
    args.push('-f', 'lavfi', '-i', `color=c=${ff(seg.background)}:s=${w}x${h}:r=${fps}:d=${seg.durationSec}`);
    if (seg.imagePath) args.push('-loop', '1', '-framerate', String(fps), '-t', String(seg.durationSec), '-i', seg.imagePath);
  });

  let inputIndex = 0;
  spec.segments.forEach((seg, i) => {
    const bgIdx = inputIndex;
    inputIndex += 1;
    let label = `[${bgIdx}:v]`;
    if (seg.imagePath) {
      const imgIdx = inputIndex;
      inputIndex += 1;
      chains.push(`[${imgIdx}:v]scale=${Math.round(w * 0.8)}:${Math.round(h * 0.55)}:force_original_aspect_ratio=decrease,format=rgba[img${i}]`);
      chains.push(`${label}[img${i}]overlay=(W-w)/2:(H-h)*0.32:shortest=1[bg${i}]`);
      label = `[bg${i}]`;
    }

    let chain = `${label}format=yuv420p`;
    const base = Math.min(w, h);
    seg.lines.forEach((line, j) => {
      const font = line.bold === false ? ctx.fontRegular : ctx.fontBold;
      const px = Math.max(12, Math.round(line.sizeFrac * base));
      const file = ctx.textFiles[i]?.[j];
      if (!file) throw new Error(`missing text file for segment ${i} line ${j}`);
      const fadeIn = `min(1,max(0,(t-${(0.25 + j * 0.2).toFixed(2)})/0.3))`;
      chain += `,drawtext=fontfile='${font}':textfile='${file}':fontsize=${px}:fontcolor=${ff(line.color)}:line_spacing=${Math.round(px * 0.25)}:x=(w-text_w)/2:y=h*${line.yFrac}-text_h/2:alpha='${fadeIn}'`;
    });
    if (spec.frameColor) {
      const inset = Math.round(Math.min(w, h) * 0.03);
      chain += `,drawbox=x=${inset}:y=${inset}:w=${w - inset * 2}:h=${h - inset * 2}:color=${ff(spec.frameColor)}@0.9:t=${Math.max(2, Math.round(inset / 6))}`;
    }
    const segmentEdge = Math.min(edge, seg.durationSec / 2);
    const segmentFrames = Math.max(1, Math.round(seg.durationSec * fps));
    chain += `,fade=t=in:st=0:d=${segmentEdge},fade=t=out:st=${Math.max(0, seg.durationSec - segmentEdge)}:d=${segmentEdge},setsar=1,tpad=stop_mode=clone:stop_duration=${(1 / fps).toFixed(8)},fps=${fps},trim=end_frame=${segmentFrames},setpts=N/(${fps}*TB)[v${i}]`;
    chains.push(chain);
  });

  chains.push(`${spec.segments.map((_, i) => `[v${i}]`).join('')}concat=n=${spec.segments.length}:v=1:a=0[vout]`);

  let audioMap: string[] = [];
  if (spec.audio) {
    const beat = 60 / spec.audio.bpm;
    const gain = spec.audio.gain;
    const expr = `${gain}*(0.55*sin(2*PI*52*t)*exp(-7*mod(t,${beat.toFixed(4)}))+0.25*sin(2*PI*110*t)*(0.5+0.5*sin(2*PI*t/${(beat * 4).toFixed(4)})))`;
    args.push('-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=${total}`);
    chains.push(`[${inputIndex}:a]afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, total - 0.6)}:d=0.6,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
    audioMap = ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k'];
  }

  args.push('-filter_complex', chains.join(';'), '-map', '[vout]', ...audioMap);
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(fps), '-t', String(total), ctx.outputPath);
  return args;
}

export async function probeVideo(path: string): Promise<FfmpegProbeSummary | null> {
  const res = await run(
    'ffprobe',
    ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,nb_read_frames:format=duration', '-of', 'json', path],
    60_000,
  );
  if (res.code !== 0) return null;
  try {
    const json = JSON.parse(res.stdout) as {
      streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; nb_read_frames?: string }>;
      format?: { duration?: string };
    };
    const video = json.streams?.find((stream) => stream.codec_type === 'video');
    const audio = json.streams?.find((stream) => stream.codec_type === 'audio');
    if (!video?.width || !video.height || !video.codec_name) return null;
    const durationSec = Number(json.format?.duration ?? 0);
    const frameCount = video.nb_read_frames ? Number(video.nb_read_frames) : null;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
    if (frameCount !== null && (!Number.isFinite(frameCount) || frameCount < 1)) return null;
    return {
      width: video.width,
      height: video.height,
      durationSec,
      videoCodec: video.codec_name,
      audioCodec: audio?.codec_name ?? null,
      frameCount,
    };
  } catch {
    return null;
  }
}

function safeSnapshotExtension(path: string): string {
  const extension = extname(path).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.asset';
}

async function snapshotSourceAssets(
  spec: FfmpegTimelineSpec,
  dir: string,
): Promise<{ renderSpec: FfmpegTimelineSpec; sourceAssets: FfmpegSourceAssetFingerprint[] }> {
  const sourceAssets: FfmpegSourceAssetFingerprint[] = [];
  const segments: FfmpegSegment[] = [];
  for (const [segmentIndex, segment] of spec.segments.entries()) {
    if (!segment.imagePath) {
      segments.push({ ...segment });
      continue;
    }
    const sourceInfo = await stat(segment.imagePath);
    if (!sourceInfo.isFile()) throw new Error(`segment ${segmentIndex}: imagePath must resolve to a regular file`);
    const snapshotPath = join(dir, `source-${segmentIndex}${safeSnapshotExtension(segment.imagePath)}`);
    await copyFile(segment.imagePath, snapshotPath);
    const snapshotInfo = await stat(snapshotPath);
    const fingerprint = { segmentIndex, sha256: await sha256File(snapshotPath), bytes: snapshotInfo.size };
    sourceAssets.push(fingerprint);
    segments.push({ ...segment, imagePath: snapshotPath });
  }
  return { renderSpec: { ...spec, segments }, sourceAssets };
}

function inputFingerprint(
  spec: FfmpegTimelineSpec,
  sourceAssets: readonly FfmpegSourceAssetFingerprint[],
  fonts: FfmpegFontFingerprints,
  ffmpegVersion: string,
  ffprobeVersion: string,
): string {
  const assetBySegment = new Map(sourceAssets.map((asset) => [asset.segmentIndex, asset]));
  const canonicalSpec = {
    contract: FFMPEG_RENDER_CONTRACT,
    executionScope: FFMPEG_RENDER_EXECUTION_SCOPE,
    toolchain: { ffmpegVersion, ffprobeVersion },
    width: spec.width,
    height: spec.height,
    fps: spec.fps,
    frameColor: spec.frameColor ?? null,
    edgeFadeSec: spec.edgeFadeSec ?? 0.25,
    audio: spec.audio ?? null,
    fonts,
    segments: spec.segments.map((segment, index) => ({
      durationSec: segment.durationSec,
      background: segment.background,
      sourceAsset: assetBySegment.get(index) ?? null,
      lines: segment.lines.map((line) => ({
        text: line.text,
        sizeFrac: line.sizeFrac,
        yFrac: line.yFrac,
        color: line.color,
        bold: line.bold ?? true,
      })),
    })),
  };
  return sha256Text(canonicalJson(canonicalSpec));
}

function probeMatchesTimeline(spec: FfmpegTimelineSpec, probe: FfmpegProbeSummary): boolean {
  if (probe.width !== spec.width || probe.height !== spec.height || probe.videoCodec !== 'h264') return false;
  if (spec.audio ? probe.audioCodec !== 'aac' : probe.audioCodec !== null) return false;
  const expectedDuration = spec.segments.reduce((sum, segment) => sum + segment.durationSec, 0);
  const expectedFrames = spec.segments.reduce((sum, segment) => sum + Math.max(1, Math.round(segment.durationSec * spec.fps)), 0);
  if (probe.frameCount !== null && probe.frameCount !== expectedFrames) return false;
  return Math.abs(probe.durationSec - expectedDuration) <= Math.max(0.25, 2 / spec.fps);
}

async function outputPathIsSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function renderFfmpegTimelineV1(spec: FfmpegTimelineSpec, outputPath: string): Promise<FfmpegRenderResult> {
  const invalid = validateTimelineSpec(spec);
  if (invalid) return { kind: 'REJECTED', reason: invalid };
  if (!isAbsolute(outputPath) || !outputPath.endsWith('.mp4')) return { kind: 'REJECTED', reason: 'outputPath must be an absolute .mp4 path' };
  if (spec.segments.some((segment) => segment.imagePath === outputPath)) return { kind: 'REJECTED', reason: 'outputPath must not overwrite an input image' };
  if (await outputPathIsSymlink(outputPath)) return { kind: 'REJECTED', reason: 'outputPath may not be a symbolic link' };

  const binary = await probeFfmpegBinary();
  if (!binary.available || !binary.version || !binary.ffprobeVersion) {
    return { kind: 'CAPABILITY_UNAVAILABLE', reason: 'ffmpeg and ffprobe binaries are required on PATH' };
  }

  const sourceRegular = spec.fontFile ?? firstExisting(FONT_CANDIDATES);
  const sourceBold = spec.fontFileBold ?? firstExisting(FONT_BOLD_CANDIDATES) ?? sourceRegular;
  if (!sourceRegular || !sourceBold || !existsSync(sourceRegular) || !existsSync(sourceBold)) {
    return { kind: 'CAPABILITY_UNAVAILABLE', reason: 'no usable font file found' };
  }

  const dir = await mkdtemp(join(tmpdir(), 'fcr-ffmpeg-'));
  try {
    const fontRegular = join(dir, 'font-regular.ttf');
    const fontBold = join(dir, 'font-bold.ttf');
    await copyFile(sourceRegular, fontRegular);
    await copyFile(sourceBold, fontBold);

    const fonts: FfmpegFontFingerprints = {
      regularSha256: await sha256File(fontRegular),
      boldSha256: await sha256File(fontBold),
    };
    const { renderSpec, sourceAssets } = await snapshotSourceAssets(spec, dir);
    const declaredInputFingerprint = inputFingerprint(
      spec,
      sourceAssets,
      fonts,
      binary.version,
      binary.ffprobeVersion,
    );

    const base = Math.min(renderSpec.width, renderSpec.height);
    const textFiles: string[][] = [];
    for (const [i, seg] of renderSpec.segments.entries()) {
      const files: string[] = [];
      for (const [j, line] of seg.lines.entries()) {
        const px = Math.max(12, Math.round(line.sizeFrac * base));
        const maxChars = Math.max(6, Math.floor((renderSpec.width * 0.84) / (px * 0.62)));
        const file = join(dir, `t-${i}-${j}.txt`);
        await writeFile(file, wrapText(line.text, maxChars), 'utf8');
        files.push(file);
      }
      textFiles.push(files);
    }

    const args = buildFfmpegArgs(renderSpec, { outputPath, textFiles, fontRegular, fontBold });
    const res = await run('ffmpeg', args, 10 * 60_000);
    if (res.code !== 0) return { kind: 'FAILED', code: 'FFMPEG_EXIT', safeMessage: 'ffmpeg render failed' };

    const info = await stat(outputPath);
    if (!info.isFile() || info.size < 1) return { kind: 'FAILED', code: 'OUTPUT_INVALID', safeMessage: 'ffmpeg did not produce a non-empty regular file' };
    const probe = await probeVideo(outputPath);
    if (!probe) return { kind: 'FAILED', code: 'PROBE_FAILED', safeMessage: 'ffprobe could not read the rendered file' };
    if (!probeMatchesTimeline(spec, probe)) {
      return { kind: 'FAILED', code: 'PROBE_MISMATCH', safeMessage: 'rendered media did not match the declared timeline contract' };
    }

    return {
      kind: 'RENDERED',
      contract: FFMPEG_RENDER_CONTRACT,
      executionScope: FFMPEG_RENDER_EXECUTION_SCOPE,
      outputPath,
      sha256: await sha256File(outputPath),
      bytes: info.size,
      inputFingerprint: declaredInputFingerprint,
      sourceAssets,
      fonts,
      ffmpegVersion: binary.version,
      ffprobeVersion: binary.ffprobeVersion,
      probe,
      motionClass: 'GRAPHIC_ANIMATION',
      truthAuthority: false,
      publishAuthority: false,
    };
  } catch {
    return {
      kind: 'FAILED',
      code: 'RENDER_PREP_FAILED',
      safeMessage: 'render preparation failed safely',
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}