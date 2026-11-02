import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { authorizeYouTubeShort } from '../src/lib/shortsPublicationGate.ts';
import { uploadReviewedYouTubeShort } from '../src/lib/shortsYouTubeTransport.ts';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const W = '11111111-1111-4111-8111-111111111111';
const SHA = 'b'.repeat(64);
const NOW = '2026-11-01T20:00:00.000Z';
const EARLY = '2026-11-01T18:00:00.000Z';
const LATER = '2026-11-02T20:00:00.000Z';
function valid() { return {
  user: { id: A, isAnonymous: false },
  membership: { userId: A, workspaceId: W, status: 'active' },
  entitlement: { userId: A, workspaceId: W, capability: 'youtube:publish', source: 'verified-billing', state: 'active', expiresAt: LATER },
  review: { workspaceId: W, assetSha256: SHA, approved: true, approvedBy: A, approvedAt: EARLY, durationSeconds: 60, width: 1080, height: 1920 },
  grant: { grantId: 'grant-123', userId: A, workspaceId: W, channelId: 'UC123456', assetSha256: SHA, privacy: 'public', action: 'youtube:publish', notBefore: EARLY, expiresAt: LATER, revoked: false },
  request: { workspaceId: W, channelId: 'UC123456', assetSha256: SHA, privacy: 'public', title: 'Cloud - Two Percent', description: 'Meet Cloud. Se\u2019kret Bip.' },
  now: NOW,
}; }
test('exact reviewed member publication is scoped, without founder privileges', () => {
  const result = authorizeYouTubeShort(valid());
  assert.equal(result.channelId, 'UC123456');
  assert.equal(result.workspaceId, W);
  assert.equal('founder' in result, false);
});
test('forged membership, plans, grants, review and destination fail closed', () => {
  for (const mutate of [
    x => { x.user.id = B; }, x => { x.user.isAnonymous = true; },
    x => { x.membership.status = 'revoked'; }, x => { x.membership.workspaceId = B; },
    x => { x.entitlement.source = 'browser'; }, x => { x.entitlement.state = 'past_due'; },
    x => { x.entitlement.userId = B; }, x => { x.entitlement.capability = 'image:generate'; },
    x => { x.entitlement.expiresAt = EARLY; }, x => { x.review.approved = false; },
    x => { x.review.assetSha256 = 'a'.repeat(64); }, x => { x.review.durationSeconds = 59; },
    x => { x.review.width = 1920; x.review.height = 1080; }, x => { x.grant.revoked = true; },
    x => { x.grant.channelId = 'UCOTHER'; }, x => { x.grant.userId = B; },
    x => { x.grant.privacy = 'private'; }, x => { x.grant.expiresAt = EARLY; },
    x => { x.grant.notBefore = LATER; }, x => { x.request.workspaceId = B; },
    x => { x.request.privacy = 'private'; },
  ]) {
    const input = valid(); mutate(input);
    assert.throws(() => authorizeYouTubeShort(input), /PUBLICATION_NOT_AUTHORIZED/);
  }
});
test('byte mismatch rejects before invoking provider or claiming a post', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fcr-yt-'));
  try {
    const filePath = join(dir, 'clip.mp4'); await writeFile(filePath, 'unreviewed bytes');
    let calls = 0;
    await assert.rejects(uploadReviewedYouTubeShort({
      prepared: authorizeYouTubeShort(valid()), filePath, accessToken: 'redacted',
      claim: async () => { calls++; return true; }, fetchImpl: async () => { calls++; throw Error('unwanted'); },
    }), /PUBLICATION_MEDIA_DRIFT/);
    assert.equal(calls, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('resumable upload checks exact bytes, provider readback and durable replay claim', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fcr-yt-'));
  try {
    const filePath = join(dir, 'clip.mp4'); const bytes = Buffer.from('fake mp4 fixture');
    await writeFile(filePath, bytes); const input = valid();
    const hash = createHash('sha256').update(bytes).digest('hex');
    input.review.assetSha256 = hash; input.grant.assetSha256 = hash; input.request.assetSha256 = hash;
    const calls = []; let claimed = 0, completed = 0;
    const fetchImpl = async (url, options = {}) => {
      calls.push([String(url), options.method ?? 'GET']);
      if (String(url).includes('/channels?')) return Response.json({ items: [{ id: 'UC123456' }] });
      if (options.method === 'POST') return new Response(null, {
        status: 200, headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=opaque' },
      });
      if (options.method === 'PUT') {
        assert.deepEqual(Buffer.from(options.body), bytes);
        return Response.json({ id: 'video-123' });
      }
      return Response.json({ items: [{ id: 'video-123', snippet: { channelId: 'UC123456' }, status: { privacyStatus: 'public' } }] });
    };
    const opts = { prepared: authorizeYouTubeShort(input), filePath, accessToken: 'redacted',
      fetchImpl, claim: async () => (++claimed === 1), complete: async () => { completed++; } };
    const out = await uploadReviewedYouTubeShort(opts);
    assert.equal(out.videoId, 'video-123'); assert.equal(completed, 1);
    assert.equal(calls.length, 4);
    await assert.rejects(uploadReviewedYouTubeShort(opts), /PUBLICATION_ALREADY_CLAIMED/);
    assert.equal(calls.filter(([_, method]) => method === 'PUT').length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('off-origin resumable URLs never receive media bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fcr-yt-'));
  try {
    const filePath = join(dir, 'clip.mp4'); const bytes = Buffer.from('fake mp4');
    await writeFile(filePath, bytes); const input = valid();
    const hash = createHash('sha256').update(bytes).digest('hex');
    input.review.assetSha256 = hash; input.grant.assetSha256 = hash; input.request.assetSha256 = hash;
    let sent = 0;
    await assert.rejects(uploadReviewedYouTubeShort({
      prepared: authorizeYouTubeShort(input), filePath, accessToken: 'opaque', claim: async () => true,
      fetchImpl: async (url, options = {}) => {
        if (String(url).includes('/channels?')) return Response.json({ items: [{ id: 'UC123456' }] });
        if (options.method === 'PUT') sent++;
        return new Response(null, { status: 200, headers: { location: 'https://evil.example/upload/youtube/v3/videos?upload_id=a' } });
      },
    }), /PUBLICATION_PROVIDER_LOCATION_UNTRUSTED/);
    assert.equal(sent, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
