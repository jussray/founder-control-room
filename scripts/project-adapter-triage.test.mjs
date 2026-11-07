import test from 'node:test';
import assert from 'node:assert/strict';
import { INCIDENT_MARKER, planFreshnessIncident, chooseIncidentAction } from './project-adapter-triage.mjs';

const sha = (character) => character.repeat(40);
const good = {
  schemaVersion: 1,
  kind: 'portfolio-project-adapter-freshness',
  allFresh: true,
  adapterCount: 1,
  results: [{
    adapterId: 'sekret-bip',
    repository: 'jussray/Sekret-Bip',
    auditedHead: sha('a'),
    currentHead: sha('b'),
    assessment: { state: 'verified', freshness: 'fresh', contractPathsDrifted: [], contractPathsMissing: [] },
  }],
};

test('unchanged contract blobs pass even when the upstream head advances', () => {
  const plan = planFreshnessIncident(good);
  assert.equal(plan.allFresh, true);
  assert.equal(chooseIncidentAction(plan, null).type, 'none');
});

test('semantic drift creates a review incident but never an approval', () => {
  const receipt = structuredClone(good);
  receipt.allFresh = false;
  receipt.results[0].assessment = {
    state: 'attention', freshness: 'stale',
    contractPathsDrifted: ['config/founder-chief-pair.contract.json'],
    contractPathsMissing: [],
  };
  const plan = planFreshnessIncident(receipt);
  assert.equal(plan.allFresh, false);
  assert.ok(plan.body.includes(INCIDENT_MARKER));
  assert.ok(plan.body.includes('config/founder-chief-pair.contract.json'));
  assert.ok(plan.body.includes('requires founder semantic review'));
  assert.ok(plan.body.includes('No automatic merge, deployment, or authority promotion'));
  assert.equal(chooseIncidentAction(plan, null).type, 'create');
  assert.equal(chooseIncidentAction(plan, { state: 'open', body: plan.body }).type, 'none');
});

test('the triage never converts inconsistent green receipts into success', () => {
  const receipt = structuredClone(good);
  receipt.results[0].assessment.state = 'attention';
  assert.throws(() => planFreshnessIncident(receipt), /inconsistent/);
});

test('failed verifier without a normal receipt remains an incident', () => {
  const plan = planFreshnessIncident({
    schemaVersion: 1,
    kind: 'portfolio-project-adapter-freshness',
    allFresh: false,
    assessment: { state: 'unknown', blocker: 'Verifier could not produce a complete receipt.' },
  });
  assert.equal(plan.allFresh, false);
  assert.match(plan.body, /Verifier could not produce/);
});

test('existing incidents are updated, closed only on full freshness, and reopened on renewed drift', () => {
  const stale = { ...good, allFresh: false, results: [{ ...good.results[0],
    assessment: { state: 'attention', freshness: 'stale', contractPathsDrifted: ['contract.json'] },
  }] };
  const badPlan = planFreshnessIncident(stale);
  assert.equal(chooseIncidentAction(badPlan, { state: 'closed', body: badPlan.body }).type, 'reopen');
  assert.equal(chooseIncidentAction(badPlan, { state: 'open', body: 'old details' }).type, 'update');
  assert.equal(chooseIncidentAction(planFreshnessIncident(good), { state: 'open', body: badPlan.body }).type, 'close');
});

test('a green receipt cannot omit adapters or repeat their identities', () => {
  const missing = structuredClone(good);
  missing.adapterCount = 2;
  assert.throws(() => planFreshnessIncident(missing), /inconsistent adapter count/);

  const duplicate = structuredClone(good);
  duplicate.results.push(structuredClone(duplicate.results[0]));
  duplicate.adapterCount = 2;
  assert.throws(() => planFreshnessIncident(duplicate), /duplicate adapter/);
});
