/** Operator-only image-to-video transport. Runtime configuration and exact-job
 * authorization are independent of generation eligibility or final media approval.
 * Contract: https://docs.dev.runwayml.com/guides/using-the-api/ (2024-11-06 API).
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { isAbsolute, extname } from 'node:path';
import { isIP } from 'node:net';
import type { MediaJobAdapter, MediaJobAdapterInput, MediaJobAdapterResult } from './mediaJobExecution.js';

const API = 'https://api.dev.runwayml.com/v1/';
const VERSION = '2024-11-06';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(code: string): never { throw new Error(code); }
export interface RunwayMediaJobOptions {
  apiKey?: string;
  enabled?: boolean;
  allowedProjectIds?: string[];
  generationEligibility?: { model: 'gen4.5'; approved: boolean; approvalReceiptId: string };
  maxCostUsdLimit?: number;
  allowedOutputHosts?: string[];
  authorize?: (input: MediaJobAdapterInput) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

async function imageBytes(path: string): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    const limit = 3_700_000; // Encoded data URI remains below the documented 5 MB.
    if (!stat.isFile() || stat.size < 12 || stat.size > limit) fail('RUNWAY_REFERENCE_INVALID');
    const buffer = Buffer.alloc(limit + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > limit) fail('RUNWAY_REFERENCE_INVALID');
    return buffer.subarray(0, total);
  } finally { await handle.close(); }
}
function imageMime(bytes: Buffer): string {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  return fail('RUNWAY_REFERENCE_FORMAT_INVALID');
}
async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) fail('RUNWAY_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 1_048_576) fail('RUNWAY_RESPONSE_TOO_LARGE');
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('RUNWAY_RESPONSE_INVALID');
    return value as Record<string, unknown>;
  } catch { return fail('RUNWAY_RESPONSE_INVALID'); }
}

export class RunwayMediaJobAdapter implements MediaJobAdapter {
  readonly id = 'runway-image-to-video@v1';
  constructor(private readonly options: RunwayMediaJobOptions = {}) {}

  private credential(): string {
    if (this.options.enabled !== true) fail('RUNWAY_EXECUTION_DISABLED');
    const key = this.options.apiKey;
    if (!key?.trim() || /[\r\n]/.test(key)) fail('RUNWAY_CREDENTIAL_NOT_CONFIGURED');
    return key;
  }
  private async request(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = this.credential();
    let response: Response;
    try {
      response = await (this.options.fetchImpl ?? fetch)(API + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${key}`, 'X-Runway-Version': VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { return fail('RUNWAY_TRANSPORT_OUTCOME_UNKNOWN'); }
    // Never echo provider bodies, prompts, credentials or signed output URLs.
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return fail(`RUNWAY_HTTP_${Number(response.status)}`);
    }
    return boundedJson(response);
  }
  async submit(input: MediaJobAdapterInput): Promise<MediaJobAdapterResult> {
    this.credential();
    if (!this.options.allowedProjectIds?.includes(input.projectId)) fail('RUNWAY_PROJECT_NOT_ALLOWED');
    const eligibility = this.options.generationEligibility;
    if (!eligibility?.approved || eligibility.model !== 'gen4.5' || !eligibility.approvalReceiptId?.trim()) fail('RUNWAY_GENERATION_ELIGIBILITY_REQUIRED');
    if (!Number.isFinite(input.maxCostUsd) || input.maxCostUsd <= 0 || !Number.isFinite(this.options.maxCostUsdLimit) || input.maxCostUsd > Number(this.options.maxCostUsdLimit)) fail('RUNWAY_BUDGET_NOT_AUTHORIZED');
    if (!this.options.authorize || !(await this.options.authorize(input))) fail('RUNWAY_JOB_AUTHORIZATION_REQUIRED');
    const req = input.request;
    if (req.model !== eligibility.model || typeof req.promptText !== 'string' || !req.promptText.trim() || req.promptText.length > 1000 || !['1280:720','720:1280'].includes(String(req.ratio)) || !Number.isInteger(req.duration) || Number(req.duration) < 2 || Number(req.duration) > 10) fail('RUNWAY_REQUEST_INVALID');
    if (input.references.length !== 1) fail('RUNWAY_ONE_APPROVED_FRAME_REQUIRED');
    const reference = input.references[0];
    if (!/^[a-f0-9]{64}$/i.test(reference.sha256)) fail('RUNWAY_REFERENCE_HASH_REQUIRED');
    let bytes: Buffer;
    try { bytes = await imageBytes(reference.path); } catch { return fail('RUNWAY_REFERENCE_INVALID'); }
    if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256.toLowerCase()) fail('RUNWAY_REFERENCE_HASH_MISMATCH');
    const mime = imageMime(bytes);
    const data = await this.request('image_to_video', 'POST', {
      model: req.model, promptText: req.promptText, ratio: req.ratio, duration: req.duration,
      promptImage: `data:${mime};base64,${bytes.toString('base64')}`,
    });
    if (typeof data.id !== 'string' || !UUID.test(data.id)) fail('RUNWAY_SUBMISSION_OUTCOME_UNKNOWN');
    return { taskId: data.id, state: 'PENDING' };
  }
  async poll(taskId: string): Promise<MediaJobAdapterResult> {
    if (!UUID.test(taskId)) fail('RUNWAY_TASK_ID_INVALID');
    const data = await this.request(`tasks/${taskId}`, 'GET');
    if (data.id !== taskId) fail('RUNWAY_TASK_ID_MISMATCH');
    if (['PENDING','RUNNING','THROTTLED'].includes(String(data.status))) return { taskId, state: 'PENDING' };
    if (data.status === 'FAILED' || data.status === 'CANCELED' || data.status === 'CANCELLED') return { taskId, state: 'FAILED', safeCode: 'RUNWAY_TASK_FAILED' };
    if (data.status !== 'SUCCEEDED' || !Array.isArray(data.output) || data.output.length !== 1 || typeof data.output[0] !== 'string') fail('RUNWAY_TASK_RESPONSE_INVALID');
    const url = trustedOutputUrl(data.output[0], this.options.allowedOutputHosts);
    return { taskId, state: 'SUCCEEDED', output: { uri: url.href, metadata: { kind: 'GENERATED_REVIEW_REQUIRED', sourceApprovalVerified: false, finalApprovalEligible: false, publicationApproved: false } } };
  }
}


export interface RunwayMaterializeOptions {
  allowedOutputHosts?: string[];
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
}

function trustedOutputUrl(value: string, hosts: readonly string[] = []): URL {
  let url: URL;
  try { url = new URL(value); } catch { return fail('RUNWAY_OUTPUT_URL_REJECTED'); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(hostname) ||
      !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(hostname) ||
      /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(hostname) ||
      !hosts.includes(hostname)) fail('RUNWAY_OUTPUT_URL_REJECTED');
  return url;
}

/** Materializes a saved provider candidate into its private job directory. The caller
 * must bind result to the saved job/task; this helper does not approve source media. */
export async function materializeRunwayOutput(
  result: MediaJobAdapterResult, outputPath: string, options: RunwayMaterializeOptions = {},
): Promise<MediaJobAdapterResult> {
  if (result.state !== 'SUCCEEDED' || !UUID.test(result.taskId) || typeof result.output?.uri !== 'string') fail('RUNWAY_OUTPUT_NOT_READY');
  const url = trustedOutputUrl(result.output.uri, options.allowedOutputHosts);
  if (!isAbsolute(outputPath) || extname(outputPath).toLowerCase() !== '.mp4') fail('RUNWAY_OUTPUT_PATH_INVALID');
  const maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 12 || maxBytes > 1024 * 1024 * 1024 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) fail('RUNWAY_DOWNLOAD_LIMIT_INVALID');
  // Claim before network access: existing files are never overwritten or fetched again.
  const handle = await open(outputPath, 'wx', 0o600);
  let complete = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    let response: Response;
    try { response = await (options.fetchImpl ?? fetch)(url.href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }); }
    catch { return fail('RUNWAY_DOWNLOAD_FAILED'); }
    if (!response.ok || !response.body) { await response.body?.cancel().catch(() => undefined); fail('RUNWAY_DOWNLOAD_FAILED'); }
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const declared = response.headers.get('content-length');
    const expected = declared === null ? null : Number(declared);
    if (!['video/mp4', 'application/octet-stream'].includes(type ?? '') ||
        (expected !== null && (!Number.isSafeInteger(expected) || expected < 12 || expected > maxBytes))) {
      await response.body.cancel().catch(() => undefined); fail('RUNWAY_DOWNLOAD_METADATA_INVALID');
    }
    reader = response.body.getReader();
    const hash = createHash('sha256');
    let bytes = 0; let prefix = Buffer.alloc(0);
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) fail('RUNWAY_DOWNLOAD_TOO_LARGE');
      const chunk = Buffer.from(next.value);
      if (prefix.length < 12) prefix = Buffer.concat([prefix, chunk.subarray(0, 12 - prefix.length)]);
      hash.update(chunk);
      await handle.writeFile(chunk);
    }
    if (bytes < 12 || (expected !== null && bytes !== expected)) fail('RUNWAY_DOWNLOAD_INCOMPLETE');
    // First MP4 box must be ftyp, fully present in the received media.
    const boxSize = prefix.readUInt32BE(0);
    if (prefix.toString('ascii', 4, 8) !== 'ftyp' || boxSize < 12 || boxSize > bytes) fail('RUNWAY_DOWNLOAD_FORMAT_INVALID');
    await handle.sync();
    complete = true;
    return { taskId: result.taskId, state: 'SUCCEEDED', output: {
      uri: outputPath, sha256: hash.digest('hex'), metadata: {
        bytes, kind: 'GENERATED_REVIEW_REQUIRED', sourceApprovalVerified: false,
        finalApprovalEligible: false, publicationApproved: false,
      },
    } };
  } catch (error) {
    const safeCodes = new Set(['RUNWAY_DOWNLOAD_FAILED', 'RUNWAY_DOWNLOAD_METADATA_INVALID', 'RUNWAY_DOWNLOAD_TOO_LARGE', 'RUNWAY_DOWNLOAD_INCOMPLETE', 'RUNWAY_DOWNLOAD_FORMAT_INVALID']);
    if (error instanceof Error && safeCodes.has(error.message)) throw error;
    return fail('RUNWAY_DOWNLOAD_FAILED');
  } finally {
    await reader?.cancel().catch(() => undefined);
    await handle.close();
    if (!complete) await rm(outputPath, { force: true });
  }
}
