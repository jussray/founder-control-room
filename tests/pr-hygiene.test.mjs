import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DRAFT_CLOSE_DAYS,
  DRAFT_STALE_DAYS,
  KEEP_LABEL,
  READY_STALE_DAYS,
  STALE_LABEL,
  planPrHygiene,
} from '../scripts/pr-hygiene.mjs';

const now = new Date('2026-11-10T00:00:00Z');
const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
const pr = (number, { draft = false, idle = 0, labels = [] } = {}) => ({
  number,
  draft,
  last_activity_at: daysAgo(idle),
  labels: labels.map((name) => ({ name })),
});

test('fresh drafts and ready PRs are left alone', () => {
  assert.deepEqual(planPrHygiene([pr(1, { draft: true, idle: DRAFT_STALE_DAYS - 1 }), pr(2, { idle: READY_STALE_DAYS - 1 })], now), []);
});

test('idle draft is marked stale, then closed only after the grace period', () => {
  assert.deepEqual(planPrHygiene([pr(3, { draft: true, idle: DRAFT_STALE_DAYS })], now), [{ number: 3, action: 'mark-stale' }]);
  assert.deepEqual(planPrHygiene([pr(4, { draft: true, idle: DRAFT_STALE_DAYS + DRAFT_CLOSE_DAYS - 1, labels: [STALE_LABEL] })], now), []);
  assert.deepEqual(planPrHygiene([pr(5, { draft: true, idle: DRAFT_STALE_DAYS + DRAFT_CLOSE_DAYS, labels: [STALE_LABEL] })], now), [{ number: 5, action: 'close' }]);
});

test('ready PRs are marked stale but never closed automatically', () => {
  assert.deepEqual(planPrHygiene([pr(6, { idle: READY_STALE_DAYS })], now), [{ number: 6, action: 'mark-stale' }]);
  assert.deepEqual(planPrHygiene([pr(7, { idle: 365, labels: [STALE_LABEL] })], now), []);
});

test('keep-open exempts any PR', () => {
  assert.deepEqual(planPrHygiene([
    pr(8, { draft: true, idle: 365, labels: [KEEP_LABEL] }),
    pr(9, { draft: true, idle: 365, labels: [KEEP_LABEL, STALE_LABEL] }),
    pr(10, { idle: 365, labels: [KEEP_LABEL] }),
  ], now), []);
});

test('invalid timestamps are skipped rather than acted on', () => {
  assert.deepEqual(planPrHygiene([{ number: 11, draft: true, last_activity_at: 'not-a-date', labels: [] }], now), []);
});

test('a new real commit removes the stale label instead of closing', () => {
  assert.deepEqual(planPrHygiene([pr(12, { draft: true, idle: 1, labels: [STALE_LABEL] })], now), [{ number: 12, action: 'unmark-stale' }]);
  assert.deepEqual(planPrHygiene([pr(13, { idle: 1, labels: [STALE_LABEL] })], now), [{ number: 13, action: 'unmark-stale' }]);
});
