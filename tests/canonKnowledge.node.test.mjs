import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendVerifiedCanon, readCanonKnowledge } from '../src/lib/canonKnowledge.ts';

const subject = { project: 'founder-control-room', key: 'cloudflare.worker.release' };
const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);
const proof = (digest, observedAt, receiptId) => ({
  ...subject, digest, observedAt, receiptId, authority: 'repository',
  sourceRef: 'github:repo/commit/sha', verifierId: 'independent-github-check',
});
const trusted = { verifyEvidence: () => true, authorizeWrite: () => true };
const create = (history, evidence, gates = trusted) => appendVerifiedCanon({
  history, subject, evidence, ...gates,
});

test('a verified observation becomes last-known canon without implying current runtime', () => {
  const events = create([], proof(digestA, '2026-10-31T12:00:00Z', 'run-001'));
  const state = readCanonKnowledge(events, subject);
  assert.equal(state.status, 'last-known-verified');
  assert.equal(state.currentRuntimeVerified, false);
  assert.equal(state.digest, digestA);
  assert.equal(state.lastVerifiedAt, '2026-10-31T12:00:00.000Z');
  assert.equal(events[0].action, 'established');
});

test('older or ambiguous evidence cannot supersede a verified canon', () => {
  const history = create([], proof(digestA, '2026-10-31T12:00:00Z', 'run-001'));
  assert.throws(() => create(history, proof(digestB, '2026-10-31T11:59:00Z', 'run-002')), /newer/);
  assert.throws(() => create(history, proof(digestB, '2026-10-31T12:00:00Z', 'run-002')), /newer/);
  assert.equal(readCanonKnowledge(history, subject).digest, digestA);
});

test('newer matching evidence reaffirms without changing canon digest', () => {
  const first = create([], proof(digestA, '2026-10-31T12:00:00Z', 'run-001'));
  const next = create(first, proof(digestA, '2026-10-31T12:05:00Z', 'run-002'));
  assert.equal(next[1].action, 'reverified');
  assert.equal(next[1].supersedes, first[0].eventHash);
  assert.equal(readCanonKnowledge(next, subject).digest, digestA);
  assert.equal(readCanonKnowledge(next, subject).lastVerifiedAt, '2026-10-31T12:05:00.000Z');
});

test('newer verified changed digest supersedes, preserving previous event', () => {
  const first = create([], proof(digestA, '2026-10-31T12:00:00Z', 'run-001'));
  const next = create(first, proof(digestB, '2026-10-31T12:05:00Z', 'run-002'));
  assert.equal(next[0].digest, digestA);
  assert.equal(next[1].action, 'superseded');
  assert.equal(readCanonKnowledge(next, subject).digest, digestB);
  assert.equal(next.length, 2);
});

test('missing independent verification or authorization cannot create canon', () => {
  const evidence = proof(digestA, '2026-10-31T12:00:00Z', 'run-001');
  assert.throws(() => create([], evidence, { verifyEvidence: () => false, authorizeWrite: () => true }), /verification denied/);
  assert.throws(() => create([], evidence, { verifyEvidence: () => true, authorizeWrite: () => false }), /write denied/);
  assert.throws(() => create([], evidence, { verifyEvidence: () => true }), /authorizeWrite/);
  assert.throws(() => create([], evidence, { authorizeWrite: () => true }), /verifyEvidence/);
});

test('invalid proof or conflicting scope is rejected', () => {
  const evidence = proof(digestA, '2026-10-31T12:00:00Z', 'run-001');
  assert.throws(() => create([], { ...evidence, digest: 'unverified' }), /digest/);
  assert.throws(() => create([], { ...evidence, project: 'another' }), /subject mismatch/);
  assert.throws(() => create([], { ...evidence, sourceRef: '' }), /sourceRef/);
  assert.throws(() => create([], { ...evidence, observedAt: 'not-a-date' }), /observedAt/);
  assert.throws(() => create([], { ...evidence, authority: 'model-output' }), /authority/);
});

test('tampering, gaps, and mismatched subjects fail closed when read', () => {
  const first = create([], proof(digestA, '2026-10-31T12:00:00Z', 'run-001'));
  const second = create(first, proof(digestB, '2026-10-31T12:05:00Z', 'run-002'));
  assert.throws(() => readCanonKnowledge([{ ...first[0], digest: digestB }], subject), /integrity/);
  assert.throws(() => readCanonKnowledge([second[1]], subject), /sequence|predecessor/);
  assert.throws(() => readCanonKnowledge(second, { ...subject, key: 'different' }), /subject mismatch/);
});

test('missing record remains unknown, without weakening existing canon', () => {
  assert.deepEqual(readCanonKnowledge([], subject), {
    status: 'unknown', project: subject.project, key: subject.key,
    digest: null, lastVerifiedAt: null, evidenceRef: null,
    currentRuntimeVerified: false, totalObservations: 0,
  });
});

test('global AI and agent contracts reconcile stale claims without weakening founder merge or credential truth', () => {
  const globalAi = readFileSync(new URL('../GLOBAL_AI.md', import.meta.url), 'utf8');
  const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  const policy = readFileSync(new URL('../docs/CANON_KNOWLEDGE_POLICY.md', import.meta.url), 'utf8');
  assert.match(globalAi, /Stale → fix to present/);
  assert.match(globalAi, /repair the affected authoritative project source/);
  assert.match(globalAi, /required_approving_review_count: 0/);
  assert.match(globalAi, /deterministic, exact-head independent review/);
  assert.match(globalAi, /separate authenticated founder-final approval/);
  assert.match(globalAi, /APP_PRIVATE_KEY_SHAPE_INVALID:unknown/);
  assert.match(globalAi, /USER-REPORTED/);
  assert.match(agents, /zero native approving human reviews/);
  assert.match(agents, /FCR_TRUSTED_SEMANTIC_REVIEWER_IDS.*compatibility-only/);
  assert.match(policy, /Stale → fix to present/);
  assert.match(policy, /preserve the predecessor last-known verified event/);
  assert.match(policy, /USER-REPORTED/);
});
