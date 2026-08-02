import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_ADVERSARIAL_LIMITS,
  evaluateAdversarialEnvelope,
  runAdversarialSimulation,
} from '../src/adversarial.mjs';

const loadSafeEnvelope = async () =>
  JSON.parse(
    await readFile(
      new URL('../fixtures/adversarial-safe-envelope.json', import.meta.url),
      'utf8',
    ),
  );

const clone = (value) => JSON.parse(JSON.stringify(value));

test('caller limit overrides can tighten but never widen the canonical ceilings', async () => {
  const safe = await loadSafeEnvelope();
  const envelope = clone(safe);
  envelope.limits = {
    maxDelegationDepth: 999_999,
    maxSteps: 999_999,
    maxCostUnits: 999_999,
    maxElapsedMs: 999_999,
    maxProofAgeMs: 999_999_999,
  };
  envelope.delegationChain.push('story-agent', 'learning-agent');
  envelope.budget.steps = DEFAULT_ADVERSARIAL_LIMITS.maxSteps + 1;
  envelope.budget.costUnits = DEFAULT_ADVERSARIAL_LIMITS.maxCostUnits + 1;
  envelope.budget.elapsedMs = DEFAULT_ADVERSARIAL_LIMITS.maxElapsedMs + 1;
  envelope.proofObservedAt = '2026-07-30T15:00:00.000Z';

  const verdict = evaluateAdversarialEnvelope(envelope);
  const result = runAdversarialSimulation(envelope);

  assert.deepEqual(verdict.limits, DEFAULT_ADVERSARIAL_LIMITS);
  assert.equal(result.simulatorInvoked, false);
  assert.ok(result.blockers.includes('delegation_depth_exceeded'));
  assert.ok(result.blockers.includes('step_budget_exceeded'));
  assert.ok(result.blockers.includes('cost_budget_exceeded'));
  assert.ok(result.blockers.includes('runtime_timeout'));
  assert.ok(result.blockers.includes('proof_stale'));
});

test('lower caller ceilings are accepted as stricter sandbox policy', async () => {
  const safe = await loadSafeEnvelope();
  const envelope = clone(safe);
  envelope.limits = {
    maxDelegationDepth: 2,
    maxSteps: 5,
    maxCostUnits: 20,
    maxElapsedMs: 1_000,
    maxProofAgeMs: 30 * 60 * 1_000,
  };

  const verdict = evaluateAdversarialEnvelope(envelope);

  assert.deepEqual(verdict.limits, envelope.limits);
  assert.ok(verdict.blockers.includes('delegation_depth_exceeded'));
  assert.ok(verdict.blockers.includes('step_budget_exceeded'));
  assert.ok(verdict.blockers.includes('cost_budget_exceeded'));
  assert.ok(verdict.blockers.includes('runtime_timeout'));
  assert.ok(verdict.blockers.includes('proof_stale'));
});

test('invalid or unknown limit fields fail closed', async () => {
  const safe = await loadSafeEnvelope();
  const invalidCases = [
    [null, 'invalid_limit_override'],
    [[], 'invalid_limit_override'],
    [{ maxSteps: Number.POSITIVE_INFINITY }, 'invalid_adversarial_envelope'],
    [{ maxSteps: -1 }, 'invalid_limit_override'],
    [{ maxSteps: 1.5 }, 'invalid_limit_override'],
    [{ unlimited: true }, 'invalid_limit_override'],
  ];

  for (const [limits, blocker] of invalidCases) {
    const envelope = clone(safe);
    envelope.limits = limits;
    const result = runAdversarialSimulation(envelope);

    assert.equal(result.status, 'blocked');
    assert.equal(result.simulatorInvoked, false);
    assert.ok(result.blockers.includes(blocker));
  }
});
