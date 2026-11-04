/**
 * Evidence-Locked Approval & Execution (ELAX) — pure gate + trusted adapter boundary.
 *
 * This module grants no publishing authority. getVerifiedApproval MUST read and
 * authenticate a founder-issued, unrevoked receipt from a trusted server-side
 * approval store. claimAtomically MUST compare-and-set the item version,
 * authorization, and consumed idempotency key in a durable transaction.
 */
import { createHash } from 'node:crypto';

export const ELAX_CONTRACT = 'juss/elax@v1';
const HEX64 = /^[a-f\d]{64}$/i;
const MAX_EVIDENCE_AGE_MS = 30 * 60_000;
const REQUIRED_GATES = Object.freeze(['integrity', 'facts', 'brandPrivacy', 'seoGeoAeo', 'runtime']);
const OPERATIONS_FIELDS = new Set([
  'status', 'approvedAt', 'approvedBy', 'approval', 'approvalReceipt',
  'publishedAt', 'publishedUrl', 'publishedId', 'publicationReceipt',
  'lastAttemptAt', 'lastError', 'lastUpdatedAt', 'executionLease',
]);

function sha256(...buffers) {
  const hash = createHash('sha256');
  for (const chunk of buffers) hash.update(chunk);
  return hash.digest('hex');
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  }
  return value;
}
function text(value) { return typeof value === 'string' ? value : ''; }
function isoMs(value) { const t = Date.parse(text(value)); return Number.isFinite(t) ? t : NaN; }
function nonEmpty(value) { return text(value).trim().length > 0; }
function validUrl(value) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }

export function computeElaxIdentity(record, mediaBytes) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('record is required');
  if (!Buffer.isBuffer(mediaBytes)) throw new Error('original media bytes are required');
  if (!nonEmpty(record.id) || !nonEmpty(record.accountId) || !nonEmpty(record.platform) || !nonEmpty(record.caption)) throw new Error('item id, platform, account and caption are required');
  const legacyContentHash = sha256(Buffer.from(record.caption, 'utf8'), mediaBytes, Buffer.from(text(record.ctaUrl), 'utf8'));
  const manifestRecord = Object.fromEntries(Object.entries(record).filter(([key]) => !OPERATIONS_FIELDS.has(key)));
  const manifestHash = sha256(JSON.stringify(stable({
    contract: 'juss/elax-manifest@v1',
    mediaSha256: sha256(mediaBytes),
    record: manifestRecord,
  })));
  return { legacyContentHash, manifestHash };
}

export function evaluateElax({ record, summaryStatus, bytes, approval, evidence, now, killSwitchEnabled = false }) {
  const reasons = [];
  let identity;
  try { identity = computeElaxIdentity(record, bytes); }
  catch (error) { reasons.push(error instanceof Error ? error.message : 'invalid record'); }
  const timestamp = isoMs(now);
  if (!Number.isFinite(timestamp)) reasons.push('current observation timestamp is invalid');
  if (killSwitchEnabled) reasons.push('kill switch enabled');
  if (!record || record.status !== 'READY_TO_PUBLISH') reasons.push('item must be READY_TO_PUBLISH');
  if (summaryStatus !== record?.status) reasons.push('status conflict between summary and item');

  if (!approval || typeof approval !== 'object') reasons.push('missing trusted founder approval');
  else {
    if (approval.verifiedBy !== 'trusted_authority_adapter') reasons.push('founder approval not verified by trusted authority adapter');
    if (!nonEmpty(approval.receiptId) || !nonEmpty(approval.actor)) reasons.push('founder approval receipt identity is missing');
    if (approval.revoked !== false) reasons.push('founder approval revoked or unknown');
    if (approval.action !== 'publish') reasons.push('approval must authorize publish');
    if (approval.platform !== record?.platform || approval.accountId !== record?.accountId) reasons.push('founder approval target mismatch');
    if (!identity || approval.manifestHash !== identity.manifestHash) reasons.push('approved manifest hash mismatch');
    if (!identity || approval.legacyContentHash !== identity.legacyContentHash) reasons.push('approved legacy content hash mismatch');
    const approvedAt = isoMs(approval.approvedAt);
    const expiresAt = isoMs(approval.expiresAt);
    if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(timestamp) ||
        approvedAt > timestamp || expiresAt <= timestamp || approvedAt >= expiresAt) reasons.push('founder approval expired, future dated or invalid');
  }

  // Never rely solely on a caller-controlled purchaseIntent=false flag.
  const requiresCommerce = record?.purchaseIntent === true || /\b(shop|buy now|order now|checkout|link in bio)\b/i.test(text(record?.caption));
  const required = [...REQUIRED_GATES, ...(requiresCommerce ? ['commerce'] : [])];
  for (const name of required) {
    const gate = evidence?.[name];
    if (gate?.status !== 'PASS') { reasons.push(`${name} evidence missing or not PASS`); continue; }
    const observed = isoMs(gate.observedAt);
    if (!Number.isFinite(observed) || !Number.isFinite(timestamp) || observed > timestamp || timestamp - observed > MAX_EVIDENCE_AGE_MS) {
      reasons.push(`${name} evidence missing, future dated or stale`);
    }
  }
  if (requiresCommerce && !validUrl(record?.ctaUrl)) reasons.push('commerce CTA URL requires HTTPS destination');
  return { allowed: reasons.length === 0, reasons, manifestHash: identity?.manifestHash ?? null };
}

/** No implicit retry after a provider write; ambiguous outcomes remain UNKNOWN. */
export async function executeElax(id, deps, now = new Date().toISOString()) {
  const snapshot = await deps.readCurrent(id);
  const approval = await deps.getVerifiedApproval(id, snapshot);
  const evidence = await deps.getCurrentEvidence(id, snapshot);
  const check = evaluateElax({ ...snapshot, approval, evidence, now,
    killSwitchEnabled: typeof deps.isKillSwitchEnabled === 'function' ? await deps.isKillSwitchEnabled(id) : true });
  // A missing kill-switch adapter fails closed. An adapter must read the live switch.
  if (!check.allowed) return { status: 'BLOCKED', reasons: check.reasons };
  let lease;
  try {
    lease = await deps.claimAtomically({
      id, expectedManifestHash: check.manifestHash, approvalReceiptId: approval.receiptId,
      targetAccountId: snapshot.record.accountId,
      targetPlatform: snapshot.record.platform,
      idempotencyKey: sha256(`${snapshot.record.platform}:${snapshot.record.accountId}:${id}:${check.manifestHash}`),
    });
  } catch { return { status: 'BLOCKED', reasons: ['atomic claim unavailable'] }; }
  if (!lease) return { status: 'BLOCKED', reasons: ['atomic claim rejected or duplicate'] };

  let providerDispatched = false;
  try {
    // The adapter must prevent edits/revocation between claim and provider dispatch.
    // A successful lease is not sufficient if the adapter allows mutable edits.
    providerDispatched = true;
    const attempt = await deps.publish(snapshot.record, snapshot.bytes, lease);
    const observed = await deps.readBack({ id, attempt, lease });
    if (!observed || observed.accountId !== snapshot.record.accountId ||
      observed.manifestHash !== check.manifestHash ||
      !nonEmpty(observed.externalPostId) || !validUrl(observed.permalink) ||
      !Number.isFinite(isoMs(observed.publishedAt)) ||
      (observed.platform != null && observed.platform !== snapshot.record.platform)) {
      const receipt = { contract: ELAX_CONTRACT, status: 'UNKNOWN', id, manifestHash: check.manifestHash,
        reason: 'provider readback missing or mismatched; no automatic retry' };
      await deps.finalize(lease, receipt);
      return receipt;
    }
    const receipt = { contract: ELAX_CONTRACT, status: 'PUBLISHED', id, manifestHash: check.manifestHash,
      externalPostId: observed.externalPostId, permalink: observed.permalink, publishedAt: observed.publishedAt };
    const finalized = await deps.finalize(lease, receipt);
    return finalized ? receipt : { ...receipt, status: 'UNKNOWN', reason: 'provider published, but receipt persistence unconfirmed; no automatic retry' };
  } catch {
    const receipt = { contract: ELAX_CONTRACT, status: providerDispatched ? 'UNKNOWN' : 'BLOCKED', id,
      manifestHash: check.manifestHash, reason: 'provider attempt or readback failed; no automatic retry' };
    try { await deps.finalize(lease, receipt); } catch { /* must not hide provider ambiguity */ }
    return receipt;
  }
}
