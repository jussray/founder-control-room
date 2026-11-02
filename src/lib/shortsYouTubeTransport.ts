/** Operator-side, opt-in YouTube resumable upload. Generation grants do not
 * authorize publishing. The caller must load approved context from trusted
 * stores and implement an atomic durable claim plus provider reconciliation.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import type { PreparedYouTubeShort } from './shortsPublicationGate.js';

const MAX_BYTES = 300 * 1024 * 1024;
const BASE = 'https://www.googleapis.com';
const fail = (code: string): never => { throw new Error(code); };
export interface YouTubeShortUploadOptions {
  prepared: PreparedYouTubeShort;
  filePath: string;
  accessToken: string;
  /** Must be a durable, atomic, workspace-scoped provider reservation. */
  claim: (key: string) => Promise<boolean>;
  complete?: (key: string, receipt: {videoId: string; channelId: string; privacy: string; assetSha256: string}) => Promise<void>;
  fetchImpl?: typeof fetch;
}
async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (raw.length > 100_000) fail('PUBLICATION_PROVIDER_RESPONSE_INVALID');
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* normalized error; provider response is never logged */ }
  return fail('PUBLICATION_PROVIDER_RESPONSE_INVALID');
}
function getId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{4,80}$/.test(value)) fail('PUBLICATION_PROVIDER_RESPONSE_INVALID');
  return value;
}
function matchChannel(payload: Record<string, unknown>, channelId: string): boolean {
  const items = payload.items;
  return Array.isArray(items) && items.length === 1 && items[0]?.id === channelId;
}
export async function uploadReviewedYouTubeShort(options: YouTubeShortUploadOptions) {
  const p = options.prepared;
  if (!options.accessToken?.trim() || /[\r\n]/.test(options.accessToken)) fail('PUBLICATION_CREDENTIAL_REQUIRED');
  const stat = await lstat(options.filePath).catch(() => fail('PUBLICATION_MEDIA_UNAVAILABLE'));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_BYTES) fail('PUBLICATION_MEDIA_UNAVAILABLE');
  const bytes = await readFile(options.filePath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== p.assetSha256) fail('PUBLICATION_MEDIA_DRIFT');
  const fetcher = options.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${options.accessToken}` };
  const channel = await fetcher(`${BASE}/youtube/v3/channels?part=id&mine=true`, { headers });
  if (!channel.ok || !matchChannel(await boundedJson(channel), p.channelId)) fail('PUBLICATION_CHANNEL_MISMATCH');
  const key = `${p.workspaceId}:${p.channelId}:${p.grantId}:${p.assetSha256}`;
  if (!await options.claim(key)) fail('PUBLICATION_ALREADY_CLAIMED');
  // Retain the claim after provider errors; reconciliation must establish outcome before retry.
  const upload = await fetcher(`${BASE}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(bytes.length) },
    body: JSON.stringify({snippet: {title: p.title, description: p.description, categoryId: '22'}, status: {privacyStatus: p.privacy}}),
  });
  if (!upload.ok) fail('PUBLICATION_PROVIDER_UPLOAD_FAILED');
  const location = upload.headers.get('location');
  if (!location) fail('PUBLICATION_PROVIDER_LOCATION_UNTRUSTED');
  let url: URL;
  try { url = new URL(location); } catch { return fail('PUBLICATION_PROVIDER_LOCATION_UNTRUSTED'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || url.port || url.username || url.password ||
      url.pathname !== '/upload/youtube/v3/videos' || !url.searchParams.has('upload_id')) fail('PUBLICATION_PROVIDER_LOCATION_UNTRUSTED');
  const sent = await fetcher(url.toString(), {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  if (!sent.ok) fail('PUBLICATION_PROVIDER_UPLOAD_FAILED');
  const body = await boundedJson(sent);
  const videoId = getId(body.id);
  // Readback prevents a successful HTTP status from being mistaken for a verified post.
  const readback = await fetcher(`${BASE}/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`, { headers });
  if (!readback.ok) fail('PUBLICATION_PROVIDER_READBACK_FAILED');
  const data = await boundedJson(readback);
  const items = data.items;
  const observed = Array.isArray(items) && items.length === 1 ? items[0] : null;
  if (observed?.id !== videoId || observed?.snippet?.channelId !== p.channelId ||
      observed?.status?.privacyStatus !== p.privacy) fail('PUBLICATION_PROVIDER_READBACK_MISMATCH');
  const receipt = { videoId, channelId: p.channelId, privacy: p.privacy, assetSha256: digest };
  await options.complete?.(key, receipt);
  return receipt;
}
