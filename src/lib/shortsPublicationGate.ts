/** Fail-closed customer publication policy. Call only with identity, membership,
 * billing entitlement, human review and publish grants retrieved from trusted
 * server stores. Never accept these objects directly from browser input.
 */
const ID = /^[a-zA-Z0-9_-]{3,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const deny = (): never => { throw new Error('PUBLICATION_NOT_AUTHORIZED'); };
export interface YouTubeShortGateInput {
  user: { id: string; isAnonymous: boolean };
  membership: { userId: string; workspaceId: string; status: string };
  entitlement: { userId: string; workspaceId: string; capability: string; source: string; state: string; expiresAt: string };
  review: { workspaceId: string; assetSha256: string; approved: boolean; approvedBy: string; approvedAt: string; durationSeconds: number; width: number; height: number };
  grant: { grantId: string; userId: string; workspaceId: string; channelId: string; assetSha256: string; privacy: string; action: string; notBefore: string; expiresAt: string; revoked: boolean };
  request: { workspaceId: string; channelId: string; assetSha256: string; privacy: string; title: string; description: string };
  now: string;
}
export interface PreparedYouTubeShort {
  readonly workspaceId: string;
  readonly userId: string;
  readonly grantId: string;
  readonly channelId: string;
  readonly assetSha256: string;
  readonly privacy: 'public' | 'unlisted' | 'private';
  readonly title: string;
  readonly description: string;
  readonly reviewedAt: string;
}
function timestamp(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) deny();
  return ms;
}
export function authorizeYouTubeShort(input: YouTubeShortGateInput): PreparedYouTubeShort {
  const { user, membership, entitlement, review, grant, request } = input;
  const now = timestamp(input.now);
  if (!UUID.test(user.id) || user.isAnonymous || !UUID.test(request.workspaceId) ||
      membership.userId !== user.id || membership.workspaceId !== request.workspaceId || membership.status !== 'active') deny();
  if (entitlement.userId !== user.id || entitlement.workspaceId !== request.workspaceId || entitlement.source !== 'verified-billing' ||
      entitlement.state !== 'active' || entitlement.capability !== 'youtube:publish' || timestamp(entitlement.expiresAt) <= now) deny();
  if (!review.approved || review.workspaceId !== request.workspaceId || review.approvedBy !== user.id ||
      review.assetSha256 !== request.assetSha256 || !SHA.test(review.assetSha256) || review.durationSeconds !== 60 ||
      !(review.height > review.width) || review.width < 1 || timestamp(review.approvedAt) > now) deny();
  if (!ID.test(grant.grantId) || grant.revoked || grant.action !== 'youtube:publish' ||
      grant.userId !== user.id || grant.workspaceId !== request.workspaceId || grant.channelId !== request.channelId ||
      grant.assetSha256 !== request.assetSha256 || grant.privacy !== request.privacy ||
      timestamp(grant.notBefore) > now || timestamp(grant.expiresAt) <= now) deny();
  if (!/^UC[a-zA-Z0-9_-]{6,45}$/.test(request.channelId) || !['public','private','unlisted'].includes(request.privacy) ||
      !request.title?.trim() || request.title.length > 100 || request.description.length > 4900) deny();
  return Object.freeze({
    workspaceId: request.workspaceId, userId: user.id, grantId: grant.grantId, channelId: request.channelId,
    assetSha256: request.assetSha256, privacy: request.privacy as PreparedYouTubeShort['privacy'],
    title: request.title, description: request.description, reviewedAt: review.approvedAt,
  });
}
