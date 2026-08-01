import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runCompanySimulation } from '../src/company.mjs';
import { createFakeTransport } from '../src/fake-transport.mjs';

const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  );

test('blocks an event with no verified traction or governance advantage', async () => {
  const input = await fixture('blocked-event.json');
  const transport = createFakeTransport();
  const result = runCompanySimulation(input, { transport });

  assert.equal(result.liveSideEffects, false);
  assert.equal(result.authority.level, 'L0');
  assert.equal(result.authority.mode, 'simulation');
  assert.equal(result.authority.executionAllowed, false);
  assert.equal(result.decision.status, 'blocked');
  assert.equal(result.decision.recommendedMode, 'internal_only');
  assert.equal(result.campaign, null);
  assert.equal(result.receipts.length, 0);
  assert.equal(transport.calls.length, 0);
  assert.ok(
    result.decision.blockers.includes(
      'missing verified traction; activity is not traction',
    ),
  );
  assert.ok(
    result.decision.blockers.includes(
      'missing governance advantage with proof',
    ),
  );
});

test('downgrades publish to draft when founder approval is absent', async () => {
  const input = await fixture('authorized-event.json');
  input.founderApprovalId = null;
  const transport = createFakeTransport();
  const result = runCompanySimulation(input, { transport });

  assert.equal(result.authority.level, 'L0');
  assert.equal(result.authority.mode, 'simulation');
  assert.equal(result.authority.executionAllowed, false);
  assert.equal(result.authority.approvalRequired, true);
  assert.equal(result.authority.approvalObserved, false);
  assert.equal(result.decision.status, 'approval_required');
  assert.equal(result.decision.recommendedMode, 'draft');
  assert.equal(result.decision.publishAllowed, false);
  assert.equal(result.receipts.length, 2);
  assert.ok(result.receipts.every((receipt) => receipt.status === 'simulated_draft'));
  assert.ok(result.receipts.every((receipt) => receipt.executionAllowed === false));
  assert.ok(result.receipts.every((receipt) => receipt.liveSideEffects === false));
  assert.ok(result.receipts.every((receipt) => receipt.publicUrl === null));
});

test('simulates an authorized publish without any live side effect', async () => {
  const input = await fixture('authorized-event.json');
  const transport = createFakeTransport();
  const result = runCompanySimulation(input, { transport });

  assert.deepEqual(result.authority, {
    level: 'L0',
    mode: 'simulation',
    executionAllowed: false,
    approvalRequired: true,
    approvalObserved: true,
  });
  assert.equal(result.decision.status, 'authorized');
  assert.equal(result.decision.publishAllowed, true);
  assert.equal(result.decision.recommendedMode, 'publish');
  assert.equal(result.receipts.length, 2);
  assert.ok(result.receipts.every((receipt) => receipt.simulation === true));
  assert.ok(result.receipts.every((receipt) => receipt.executionAllowed === false));
  assert.ok(result.receipts.every((receipt) => receipt.liveSideEffects === false));
  assert.ok(result.receipts.every((receipt) => receipt.status === 'simulated_publish'));
  assert.ok(result.receipts.every((receipt) => receipt.publicUrl === null));
  assert.equal(result.liveSideEffects, false);
});

test('routes dedicated content fields and never transports raw instructions', async () => {
  const input = await fixture('authorized-event.json');
  input.privatePrompt = 'DO NOT TRANSPORT THIS PRIVATE ORCHESTRATION TEXT';
  const transport = createFakeTransport();
  const result = runCompanySimulation(input, { transport });

  assert.deepEqual(
    result.campaign.drafts.map(({ platform, contentField }) => ({ platform, contentField })),
    [
      { platform: 'linkedin', contentField: 'linkedin_draft' },
      {
        platform: 'facebook_founder',
        contentField: 'facebook_founder_draft',
      },
    ],
  );
  assert.ok(
    result.receipts.every(
      (receipt) => !receipt.content.includes(input.privatePrompt),
    ),
  );
});

test('rejects any non-synthetic input before an agent or adapter runs', async () => {
  const input = await fixture('authorized-event.json');
  input.dataClassification = 'production';
  const transport = createFakeTransport();

  assert.throws(
    () => runCompanySimulation(input, { transport }),
    /synthetic data only/i,
  );
  assert.equal(transport.calls.length, 0);
});

test('blocks cross-project proof even when every other field is complete', async () => {
  const input = await fixture('authorized-event.json');
  input.proof.projectSlug = 'different-synthetic-project';
  const transport = createFakeTransport();
  const result = runCompanySimulation(input, { transport });

  assert.equal(result.decision.status, 'blocked');
  assert.ok(
    result.decision.blockers.includes(
      'proof and event belong to different projects',
    ),
  );
  assert.equal(transport.calls.length, 0);
});

test('blocks a complete synthetic event when clickable proof is missing', async () => {
  const input = await fixture('parity-missing-proof.json');
  const transport = createFakeTransport();
  const result = runCompanySimulation(input, { transport });

  assert.equal(result.decision.status, 'blocked');
  assert.ok(result.decision.blockers.includes('missing clickable proof'));
  assert.equal(result.authority.executionAllowed, false);
  assert.equal(result.campaign, null);
  assert.equal(result.receipts.length, 0);
  assert.equal(transport.calls.length, 0);
});

test('ignores stale approval references on draft-only simulations', async () => {
  const input = await fixture('authorized-event.json');
  input.requestedMode = 'draft';
  input.founderApprovalId = 'founder-approved:stale-draft-token';
  const transport = createFakeTransport();
  const result = runCompanySimulation(input, { transport });

  assert.deepEqual(result.authority, {
    level: 'L0',
    mode: 'simulation',
    executionAllowed: false,
    approvalRequired: false,
    approvalObserved: false,
  });
  assert.equal(result.decision.status, 'draft_ready');
  assert.equal(result.decision.publishAllowed, false);
  assert.ok(result.receipts.every((receipt) => receipt.status === 'simulated_draft'));
  assert.equal(result.liveSideEffects, false);
});
