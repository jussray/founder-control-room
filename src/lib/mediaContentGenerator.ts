import { randomUUID } from 'node:crypto';
import type { SocialMediaAsset } from './firstPartySocialPublisher.js';

/**
 * Real image/video generation for content-autopilot post media, authorized
 * 2026-11-11 for OpenAI (images), Google Gemini/Imagen + Veo (images and
 * video), and ElevenLabs (images and video). This is a deliberately narrower
 * module than `src/lib/mediaRouter.ts` + `mediaExecutionService.ts`, which is
 * this repo's own much larger "Phase 1" media-routing/budget/attack-flow/
 * asset-registry system whose actual provider execution stubs
 * (`renderGeminiImage`, `renderSeedanceVideo`) are explicitly left as
 * `CAPABILITY_UNAVAILABLE: "...not implemented in Phase 1"`. This module does
 * not attempt to complete that system — it does not reserve budget, write an
 * asset-registry entry, or produce a `MediaExecutionReceiptV1`. It is a
 * standalone path specific to social-post media, the same way
 * `perplexityContentGenerator.ts` stands alongside (not inside)
 * `operatorRelayModelProviders.ts`. Completing the Phase 1 system properly
 * remains separate, larger work.
 *
 * Video generation (Veo, ElevenLabs flows/video) is accepted here as
 * best-effort synchronous polling with a short bounded timeout, per explicit
 * founder instruction — real video jobs often take well past this timeout
 * and will cleanly fail rather than hang; this is not production-grade video
 * support and was approved as a known rough edge, not a guarantee.
 */

export const MEDIA_CONTENT_GENERATION_CONTRACT = 'fcr/media-content-generation@v1' as const;

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // generous for base64 image/video JSON payloads
const IMAGE_TIMEOUT_MS = 60_000;
const VIDEO_POLL_TIMEOUT_MS = 25_000;
const VIDEO_POLL_INTERVAL_MS = 5_000;

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

export class MediaContentGenerationError extends Error {
  readonly code = 'MEDIA_CONTENT_GENERATION_REJECTED';
}

export type MediaGenerationResult =
  | { kind: 'SUCCESS'; bytes: Buffer; contentType: string; providerTaskId: string | null }
  | { kind: 'FAILED'; code: string; safeMessage: string; retryable: boolean }
  | { kind: 'CAPABILITY_UNAVAILABLE'; reason: string };

export interface MediaGenerationOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  /** Overrides the video poll timeout/interval for tests; never for production use. */
  pollTimingMsForTests?: { timeoutMs: number; intervalMs: number };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function unavailable(reason: string): MediaGenerationResult {
  return { kind: 'CAPABILITY_UNAVAILABLE', reason };
}

function failed(code: string, safeMessage: string, retryable = false): MediaGenerationResult {
  return { kind: 'FAILED', code, safeMessage, retryable };
}

async function boundedResponseText(response: Response, label: string): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      try {
        await response.body?.cancel();
      } catch {
        // size receipt remains valid even if an already-closed stream can't be cancelled
      }
      throw new MediaContentGenerationError(`${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`);
    }
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new MediaContentGenerationError(`${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

async function jsonBody(response: Response, label: string): Promise<JsonRecord> {
  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // failure to cancel an already-closed body does not change provider truth
    }
    throw new MediaContentGenerationError(`${label} failed with HTTP ${response.status}`);
  }
  const raw = await boundedResponseText(response, label);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MediaContentGenerationError(`${label} returned non-JSON output`);
  }
  const body = record(parsed);
  if (!body) throw new MediaContentGenerationError(`${label} returned an invalid response object`);
  return body;
}

async function callProvider(
  fetchImpl: FetchLike,
  label: string,
  url: string,
  init: RequestInit,
): Promise<MediaGenerationResult | JsonRecord> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, redirect: 'error' });
  } catch {
    return failed('PROVIDER_REQUEST_FAILED', `${label} request failed`, true);
  }
  try {
    return await jsonBody(response, label);
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} failed`;
    return failed('PROVIDER_RESPONSE_REJECTED', message, false);
  }
}

function isGenerationResult(value: unknown): value is MediaGenerationResult {
  const candidate = record(value);
  return Boolean(candidate && typeof candidate.kind === 'string');
}

// ---------------------------------------------------------------------------
// OpenAI — image generation
// ---------------------------------------------------------------------------

export interface GenerateOpenAiImageInput {
  prompt: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
}

/**
 * Model id is required via FCR_OPENAI_IMAGE_MODEL with no hardcoded default,
 * matching this repo's existing convention for every other relay/generation
 * model id (see operatorRelayModelProviders.ts) — model names here move
 * faster than this code is reviewed, so the exact current id is an operator
 * decision at deploy time, not a guess baked into source.
 */
export async function generateOpenAiImage(
  input: GenerateOpenAiImageInput,
  options: MediaGenerationOptions = {},
): Promise<MediaGenerationResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = text(env.OPENAI_API_KEY);
  const model = text(env.FCR_OPENAI_IMAGE_MODEL);
  if (!apiKey || !model) return unavailable('OPENAI_API_KEY and FCR_OPENAI_IMAGE_MODEL must both be configured');
  if (text(env.FCR_MEDIA_GENERATION_ENABLED).toLowerCase() !== 'true') {
    return unavailable('set FCR_MEDIA_GENERATION_ENABLED=true to enable media generation');
  }

  const result = await callProvider(fetchImpl, 'OpenAI image generation', 'https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: input.prompt, size: input.size ?? '1024x1024', n: 1 }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (isGenerationResult(result)) return result;

  const data = Array.isArray(result.data) ? result.data : [];
  const first = record(data[0]);
  const b64 = text(first?.b64_json);
  if (!b64) return failed('OPENAI_IMAGE_MISSING_DATA', 'OpenAI image response contained no image data', false);

  try {
    return { kind: 'SUCCESS', bytes: Buffer.from(b64, 'base64'), contentType: 'image/png', providerTaskId: null };
  } catch {
    return failed('OPENAI_IMAGE_DECODE_FAILED', 'OpenAI image response could not be decoded', false);
  }
}

// ---------------------------------------------------------------------------
// Gemini — image generation (gemini-*-image models via generateContent)
// ---------------------------------------------------------------------------

export interface GenerateGeminiImageInput {
  prompt: string;
}

export async function generateGeminiImage(
  input: GenerateGeminiImageInput,
  options: MediaGenerationOptions = {},
): Promise<MediaGenerationResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = text(env.GEMINI_API_KEY);
  const model = text(env.FCR_GEMINI_IMAGE_MODEL);
  if (!apiKey || !model) return unavailable('GEMINI_API_KEY and FCR_GEMINI_IMAGE_MODEL must both be configured');
  if (text(env.FCR_MEDIA_GENERATION_ENABLED).toLowerCase() !== 'true') {
    return unavailable('set FCR_MEDIA_GENERATION_ENABLED=true to enable media generation');
  }

  const result = await callProvider(
    fetchImpl,
    'Gemini image generation',
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: input.prompt }] }] }),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    },
  );
  if (isGenerationResult(result)) return result;

  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const content = record(record(candidates[0])?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  for (const part of parts) {
    const inline = record(record(part)?.inlineData);
    const data = text(inline?.data);
    const mimeType = text(inline?.mimeType) || 'image/png';
    if (data) {
      try {
        return { kind: 'SUCCESS', bytes: Buffer.from(data, 'base64'), contentType: mimeType, providerTaskId: null };
      } catch {
        return failed('GEMINI_IMAGE_DECODE_FAILED', 'Gemini image response could not be decoded', false);
      }
    }
  }
  return failed('GEMINI_IMAGE_MISSING_DATA', 'Gemini image response contained no inline image data', false);
}

// ---------------------------------------------------------------------------
// Gemini — video generation (Veo, async operation polling)
// ---------------------------------------------------------------------------

export interface GenerateGeminiVideoInput {
  prompt: string;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Veo is asynchronous: submit via `:predictLongRunning`, then poll the
 * returned operation name until `done`. Real jobs commonly take well over a
 * minute; this polls for only VIDEO_POLL_TIMEOUT_MS (overridable in tests
 * only) and fails cleanly on timeout rather than hang — the explicitly
 * accepted rough edge for video in this pass. The exact operation response
 * shape (video bytes vs. a provider-hosted URI) is the least-verified part
 * of this function; it is written defensively and fails closed rather than
 * guessing at a field that turns out not to exist.
 */
export async function generateGeminiVideo(
  input: GenerateGeminiVideoInput,
  options: MediaGenerationOptions = {},
): Promise<MediaGenerationResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = text(env.GEMINI_API_KEY);
  const model = text(env.FCR_GEMINI_VIDEO_MODEL);
  if (!apiKey || !model) return unavailable('GEMINI_API_KEY and FCR_GEMINI_VIDEO_MODEL must both be configured');
  if (text(env.FCR_MEDIA_GENERATION_ENABLED).toLowerCase() !== 'true') {
    return unavailable('set FCR_MEDIA_GENERATION_ENABLED=true to enable media generation');
  }

  const submission = await callProvider(
    fetchImpl,
    'Gemini video generation',
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predictLongRunning`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt: input.prompt }] }),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    },
  );
  if (isGenerationResult(submission)) return submission;

  const operationName = text(submission.name);
  if (!operationName) return failed('GEMINI_VIDEO_NO_OPERATION', 'Gemini video submission returned no operation name', false);

  const timeoutMs = options.pollTimingMsForTests?.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS;
  const intervalMs = options.pollTimingMsForTests?.intervalMs ?? VIDEO_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const poll = await callProvider(
      fetchImpl,
      'Gemini video operation poll',
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      { method: 'GET', headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) },
    );
    if (isGenerationResult(poll)) return poll;

    if (poll.done === true) {
      const operationError = record(poll.error);
      if (operationError) {
        return failed('GEMINI_VIDEO_OPERATION_FAILED', text(operationError.message) || 'Gemini video operation failed', false);
      }
      const response = record(poll.response);
      const generateVideoResponse = record(response?.generateVideoResponse);
      const samples = Array.isArray(generateVideoResponse?.generatedSamples) ? generateVideoResponse.generatedSamples : [];
      const firstSample = record(samples[0]);
      const video = record(firstSample?.video);
      const data = text(video?.bytesBase64Encoded) || text(video?.data);
      const mimeType = text(video?.mimeType) || 'video/mp4';
      if (data) {
        try {
          return { kind: 'SUCCESS', bytes: Buffer.from(data, 'base64'), contentType: mimeType, providerTaskId: operationName };
        } catch {
          return failed('GEMINI_VIDEO_DECODE_FAILED', 'Gemini video response could not be decoded', false);
        }
      }
      return failed(
        'GEMINI_VIDEO_MISSING_DATA',
        'Gemini video operation completed but returned no recognizable inline video data',
        false,
      );
    }

    await sleep(intervalMs);
  }

  return failed('GEMINI_VIDEO_POLL_TIMEOUT', 'Gemini video generation did not complete within the bounded poll window', true);
}

// ---------------------------------------------------------------------------
// ElevenLabs — image and video generation (Flows API)
// ---------------------------------------------------------------------------

export interface GenerateElevenLabsImageInput {
  prompt: string;
}

export async function generateElevenLabsImage(
  input: GenerateElevenLabsImageInput,
  options: MediaGenerationOptions = {},
): Promise<MediaGenerationResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = text(env.ELEVENLABS_API_KEY);
  const model = text(env.FCR_ELEVENLABS_IMAGE_MODEL);
  if (!apiKey || !model) return unavailable('ELEVENLABS_API_KEY and FCR_ELEVENLABS_IMAGE_MODEL must both be configured');
  if (text(env.FCR_MEDIA_GENERATION_ENABLED).toLowerCase() !== 'true') {
    return unavailable('set FCR_MEDIA_GENERATION_ENABLED=true to enable media generation');
  }

  const result = await callProvider(fetchImpl, 'ElevenLabs image generation', 'https://api.elevenlabs.io/v1/flows/image', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: model, prompt: input.prompt }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (isGenerationResult(result)) return result;

  const signedUrl = text(result.result_url) || text(result.url);
  const status = text(result.status);
  if (status && status !== 'completed' && status !== 'succeeded') {
    return failed('ELEVENLABS_IMAGE_NOT_COMPLETED', `ElevenLabs image generation returned status: ${status || 'unknown'}`, false);
  }
  if (!signedUrl) return failed('ELEVENLABS_IMAGE_MISSING_URL', 'ElevenLabs image response contained no result URL', false);

  return fetchSignedMediaAsset(fetchImpl, signedUrl, 'ElevenLabs image asset download');
}

export interface GenerateElevenLabsVideoInput {
  prompt: string;
}

/**
 * Also asynchronous. The confirmed REST entry point is
 * `POST /v1/flows/video`; the exact polling path for the created job is
 * inferred from the SDK's `flows.video.get` method as
 * `GET /v1/flows/video/{id}` and is the least-verified part of this
 * function — see the module header. A mismatch here fails closed.
 */
export async function generateElevenLabsVideo(
  input: GenerateElevenLabsVideoInput,
  options: MediaGenerationOptions = {},
): Promise<MediaGenerationResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = text(env.ELEVENLABS_API_KEY);
  const model = text(env.FCR_ELEVENLABS_VIDEO_MODEL);
  if (!apiKey || !model) return unavailable('ELEVENLABS_API_KEY and FCR_ELEVENLABS_VIDEO_MODEL must both be configured');
  if (text(env.FCR_MEDIA_GENERATION_ENABLED).toLowerCase() !== 'true') {
    return unavailable('set FCR_MEDIA_GENERATION_ENABLED=true to enable media generation');
  }

  const submission = await callProvider(fetchImpl, 'ElevenLabs video generation', 'https://api.elevenlabs.io/v1/flows/video', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: model, prompt: input.prompt }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (isGenerationResult(submission)) return submission;

  const jobId = text(submission.id) || text(submission.generation_id);
  if (!jobId) return failed('ELEVENLABS_VIDEO_NO_JOB_ID', 'ElevenLabs video submission returned no job id', false);

  const timeoutMs = options.pollTimingMsForTests?.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS;
  const intervalMs = options.pollTimingMsForTests?.intervalMs ?? VIDEO_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const poll = await callProvider(
      fetchImpl,
      'ElevenLabs video job poll',
      `https://api.elevenlabs.io/v1/flows/video/${encodeURIComponent(jobId)}`,
      { method: 'GET', headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) },
    );
    if (isGenerationResult(poll)) return poll;

    const status = text(poll.status);
    if (status === 'failed' || status === 'error') {
      return failed('ELEVENLABS_VIDEO_JOB_FAILED', text(poll.error) || 'ElevenLabs video job failed', false);
    }
    if (status === 'completed' || status === 'succeeded') {
      const signedUrl = text(poll.result_url) || text(poll.url);
      if (!signedUrl) return failed('ELEVENLABS_VIDEO_MISSING_URL', 'ElevenLabs video job completed but returned no result URL', false);
      return fetchSignedMediaAsset(fetchImpl, signedUrl, 'ElevenLabs video asset download');
    }

    await sleep(intervalMs);
  }

  return failed('ELEVENLABS_VIDEO_POLL_TIMEOUT', 'ElevenLabs video generation did not complete within the bounded poll window', true);
}

async function fetchSignedMediaAsset(fetchImpl: FetchLike, url: string, label: string): Promise<MediaGenerationResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return failed('MEDIA_ASSET_URL_INVALID', `${label}: result URL was not a valid URL`, false);
  }
  if (parsed.protocol !== 'https:') {
    return failed('MEDIA_ASSET_URL_INSECURE', `${label}: result URL must be HTTPS`, false);
  }

  let response: Response;
  try {
    response = await fetchImpl(parsed.toString(), { redirect: 'error', signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  } catch {
    return failed('MEDIA_ASSET_DOWNLOAD_FAILED', `${label} failed`, true);
  }
  if (!response.ok) {
    return failed('MEDIA_ASSET_DOWNLOAD_FAILED', `${label} failed with HTTP ${response.status}`, false);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    try {
      await response.body?.cancel();
    } catch {
      // size receipt remains valid regardless
    }
    return failed('MEDIA_ASSET_TOO_LARGE', `${label} exceeded ${MAX_RESPONSE_BYTES} bytes`, false);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    return failed('MEDIA_ASSET_TOO_LARGE', `${label} exceeded ${MAX_RESPONSE_BYTES} bytes`, false);
  }
  return { kind: 'SUCCESS', bytes: buffer, contentType, providerTaskId: null };
}

// ---------------------------------------------------------------------------
// Hosting — upload a generated asset so it has a stable HTTPS URL
// ---------------------------------------------------------------------------

/**
 * Narrow structural subset of Cloudflare's real `R2Bucket.put()` — enough to
 * accept the live binding directly without this module depending on
 * `@cloudflare/workers-types`, and enough to fake easily in tests.
 */
export interface MediaAssetBucket {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/**
 * Uploads generated bytes to the project's R2 bucket and returns the stable
 * HTTPS URL the `/media-assets/:key` Worker route serves it from
 * (`src/worker/mediaAssetIngress.ts`). Grants no publish authority by
 * itself — the asset existing at a URL is not the same as a post referencing
 * it being founder-approved to publish.
 */
export async function uploadGeneratedMediaAsset(
  bucket: MediaAssetBucket,
  baseUrl: string,
  generated: { bytes: Buffer; contentType: string },
): Promise<SocialMediaAsset> {
  const extension = EXTENSION_BY_CONTENT_TYPE[generated.contentType] ?? 'bin';
  const key = `${randomUUID()}.${extension}`;
  await bucket.put(key, generated.bytes, { httpMetadata: { contentType: generated.contentType } });

  const url = new URL(`/media-assets/${key}`, baseUrl).toString();
  return {
    type: generated.contentType.startsWith('video/') ? 'video' : 'image',
    url,
    altText: null,
  };
}
