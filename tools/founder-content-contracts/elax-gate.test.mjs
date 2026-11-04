import test from 'node:test';
import assert from 'node:assert/strict';
import { computeElaxIdentity, evaluateElax, executeElax } from './elax-gate.mjs';

const now = '2026-11-04T02:00:00.000Z';
const bytes = Buffer.from('synthetic-owned-media');
const item = () => ({
  id: 'B1-01', campaignId: 'Batch-1', status: 'READY_TO_PUBLISH',
  platform: 'instagram', accountId: '@jussnco', caption: 'Evidence-backed synthetic sample',
  ctaUrl: 'https://example.com', mediaFile: 'example.png', altText: 'Synthetic graphic',
  hashtags: ['#Example'], scheduledAt: '2026-11-04T02:00:00.000Z', purchaseIntent: false,
  approvedAt: '2026-11-04T01:55:00.000Z',
});
const gates = () => Object.fromEntries(
  ['integrity', 'facts', 'brandPrivacy', 'seoGeoAeo', 'runtime'].map(name => [name, { status: 'PASS', observedAt: '2026-11-04T01:59:00.000Z' }]),
);
function approvalFor(record = item()) {
  const identity = computeElaxIdentity(record, bytes);
  return {
    receiptId: 'receipt-1', actor: 'founder', verifiedBy: 'trusted_authority_adapter',
    action: 'publish', accountId: record.accountId, platform: record.platform,
    manifestHash: identity.manifestHash, legacyContentHash: identity.legacyContentHash,
    approvedAt: record.approvedAt, expiresAt: '2026-11-04T02:10:00.000Z', revoked: false,
  };
}
const context = (overrides = {}) => {
  const record = item();
  return { record, summaryStatus: 'READY_TO_PUBLISH', bytes, approval: approvalFor(record), evidence: gates(), now, ...overrides };
};

test('accepts one exact approved, current, fully verified item', () => {
  assert.deepEqual(evaluateElax(context()), { allowed: true, reasons: [], manifestHash: computeElaxIdentity(item(), bytes).manifestHash });
});
test('rejects contradictory header versus item status', () => {
  assert.match(evaluateElax(context({ summaryStatus: 'APPROVED' })).reasons.join(' '), /status conflict/);
});
test('rejects draft even when approval object exists', () => {
  assert.match(evaluateElax(context({ record: { ...item(), status: 'DRAFT' }, summaryStatus: 'DRAFT' })).reasons.join(' '), /READY_TO_PUBLISH/);
});
test('rejects approval not bound to exact caption', () => {
  assert.match(evaluateElax(context({ record: { ...item(), caption: 'replaced copy' } })).reasons.join(' '), /manifest hash/);
});
test('rejects changed target account and changed media bytes', () => {
  assert.equal(evaluateElax(context({ record: { ...item(), accountId: '@other' } })).allowed, false);
  assert.equal(evaluateElax(context({ bytes: Buffer.from('altered') })).allowed, false);
});
test('rejects revoked, stale, or missing approval', () => {
  assert.equal(evaluateElax(context({ approval: null })).allowed, false);
  assert.equal(evaluateElax(context({ approval: { ...approvalFor(), revoked: true } })).allowed, false);
  assert.equal(evaluateElax(context({ approval: { ...approvalFor(), expiresAt: '2026-11-04T01:59:00.000Z' } })).allowed, false);
});
test('rejects missing and stale evidence, checkout required for purchase intent', () => {
  assert.equal(evaluateElax(context({ evidence: { ...gates(), facts: undefined } })).allowed, false);
  assert.equal(evaluateElax(context({ evidence: { ...gates(), facts: { status: 'PASS', observedAt: '2026-11-04T01:01:00.000Z' } } })).allowed, false);
  assert.match(evaluateElax(context({ record: { ...item(), purchaseIntent: true } })).reasons.join(' '), /commerce/);
});
test('requires trusted authority verification and atomic claim before any publish', async () => {
  const calls = [];
  const deps = {
    isKillSwitchEnabled: async () => false,
    readCurrent: async () => ({ record: item(), summaryStatus: 'READY_TO_PUBLISH', bytes }),
    getVerifiedApproval: async () => null,
    getCurrentEvidence: async () => gates(),
    claimAtomically: async () => { calls.push('claim'); return 'lease'; },
    publish: async () => { calls.push('publish'); throw new Error('should not call'); },
    readBack: async () => null,
    finalize: async () => true,
  };
  const result = await executeElax('B1-01', deps, now);
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(calls, []);
});
test('fails closed after unsuccessful atomic claim', async () => {
  const calls = [];
  const deps = {
    isKillSwitchEnabled: async () => false,
    readCurrent: async () => ({ record: item(), summaryStatus: 'READY_TO_PUBLISH', bytes }),
    getVerifiedApproval: async () => approvalFor(),
    getCurrentEvidence: async () => gates(),
    claimAtomically: async () => { calls.push('claim'); return null; },
    publish: async () => { calls.push('publish'); },
    readBack: async () => null,
    finalize: async () => true,
  };
  assert.equal((await executeElax('B1-01', deps, now)).status, 'BLOCKED');
  assert.deepEqual(calls, ['claim']);
});
test('published status only after exact provider readback and persisted receipt', async () => {
  const calls = [];
  const identity = computeElaxIdentity(item(), bytes);
  const deps = {
    isKillSwitchEnabled: async () => false,
    readCurrent: async () => ({ record: item(), summaryStatus: 'READY_TO_PUBLISH', bytes }),
    getVerifiedApproval: async () => approvalFor(),
    getCurrentEvidence: async () => gates(),
    claimAtomically: async () => { calls.push('claim'); return 'lease-1'; },
    publish: async () => { calls.push('publish'); return { requestId: 'provider-1' }; },
    readBack: async () => { calls.push('readback'); return { accountId: '@jussnco', manifestHash: identity.manifestHash, externalPostId: 'post-1', permalink: 'https://example.com/post-1', publishedAt: now }; },
    finalize: async (_lease, receipt) => { calls.push('finalize'); assert.equal(receipt.status, 'PUBLISHED'); return true; },
  };
  assert.equal((await executeElax('B1-01', deps, now)).status, 'PUBLISHED');
  assert.deepEqual(calls, ['claim', 'publish', 'readback', 'finalize']);
});
test('provider outcome without confirming readback remains UNKNOWN and must not retry automatically', async () => {
  const deps = {
    isKillSwitchEnabled: async () => false,
    readCurrent: async () => ({ record: item(), summaryStatus: 'READY_TO_PUBLISH', bytes }),
    getVerifiedApproval: async () => approvalFor(),
    getCurrentEvidence: async () => gates(),
    claimAtomically: async () => 'lease-1',
    publish: async () => ({ requestId: 'provider-1' }),
    readBack: async () => null,
    finalize: async () => true,
  };
  assert.equal((await executeElax('B1-01', deps, now)).status, 'UNKNOWN');
});


test('missing trusted kill-switch reader blocks all publication', async () => {
  const deps = {
    readCurrent: async () => ({ record: item(), summaryStatus: 'READY_TO_PUBLISH', bytes }),
    getVerifiedApproval: async () => approvalFor(),
    getCurrentEvidence: async () => gates(),
    claimAtomically: async () => { throw new Error('must not claim'); },
  };
  assert.equal((await executeElax('B1-01', deps, now)).status, 'BLOCKED');
});

test('manifest changes for hashtags and alt text invalidate approval', () => {
  assert.equal(evaluateElax(context({ record: { ...item(), hashtags: ['#changed'] } })).allowed, false);
  assert.equal(evaluateElax(context({ record: { ...item(), altText: 'different image description' } })).allowed, false);
});

test('kill switch blocks even fresh and fully approved content', () => {
  assert.match(evaluateElax(context({ killSwitchEnabled: true })).reasons.join(' '), /kill switch/);
});

test('a provider success with failed receipt persistence is UNKNOWN, no blind retry', async () => {
  const identity = computeElaxIdentity(item(), bytes);
  const deps = {
    isKillSwitchEnabled: async () => false,
    readCurrent: async () => ({ record: item(), summaryStatus: 'READY_TO_PUBLISH', bytes }),
    getVerifiedApproval: async () => approvalFor(),
    getCurrentEvidence: async () => gates(),
    claimAtomically: async () => 'lease',
    publish: async () => ({ requestId: 'provider1' }),
    readBack: async () => ({ accountId: '@jussnco', manifestHash: identity.manifestHash, externalPostId: 'post1', permalink: 'https://example.com/post1', publishedAt: now }),
    finalize: async () => false,
  };
  assert.equal((await executeElax('B1-01', deps, now)).status, 'UNKNOWN');
});


test('shop and link-in-bio copy cannot bypass commerce with purchaseIntent=false', () => {
  for (const caption of ['Shop the wig — link in bio.', 'Buy now: today only']) {
    const result = evaluateElax(context({ record: { ...item(), caption, purchaseIntent: false } }));
    assert.match(result.reasons.join(' '), /commerce/);
  }
});

test('mismatched provider account is not published despite an accepted write', async () => {
  const identity = computeElaxIdentity(item(), bytes);
  const deps = {
    isKillSwitchEnabled: async () => false,
    readCurrent: async () => ({ record: item(), summaryStatus: 'READY_TO_PUBLISH', bytes }),
    getVerifiedApproval: async () => approvalFor(),
    getCurrentEvidence: async () => gates(),
    claimAtomically: async () => 'lease',
    publish: async () => ({ requestId: 'provider1' }),
    readBack: async () => ({ accountId: '@another-brand', manifestHash: identity.manifestHash, externalPostId: 'post1', permalink: 'https://example.com/post1', publishedAt: now }),
    finalize: async () => true,
  };
  assert.equal((await executeElax('B1-01', deps, now)).status, 'UNKNOWN');
});
