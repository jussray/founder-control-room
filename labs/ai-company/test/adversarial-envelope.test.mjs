import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runAdversarialSimulation } from '../src/adversarial.mjs';

const loadSafeEnvelope = async () =>
  JSON.parse(
    await readFile(
      new URL('../fixtures/adversarial-safe-envelope.json', import.meta.url),
      'utf8',
    ),
  );

const clone = (value) => JSON.parse(JSON.stringify(value));

test('seals the complete adversarial envelope before reading its fields', async () => {
  const safe = await loadSafeEnvelope();
  const invalidEnvelopes = [
    { ...safe, callback() {} },
    Object.assign(Object.create({ inheritedAuthority: true }), safe),
  ];

  const circular = clone(safe);
  circular.self = circular;
  invalidEnvelopes.push(circular);

  const customArray = clone(safe);
  const chain = [...customArray.delegationChain];
  Object.setPrototypeOf(chain, { attacker: true });
  customArray.delegationChain = chain;
  invalidEnvelopes.push(customArray);

  for (const envelope of invalidEnvelopes) {
    const result = runAdversarialSimulation(envelope);
    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'preflight');
    assert.equal(result.simulatorInvoked, false);
    assert.deepEqual(result.blockers, ['invalid_adversarial_envelope']);
  }
});

test('requires a Chief AI-rooted delegation chain of known synthetic agents', async (t) => {
  const safe = await loadSafeEnvelope();
  const scenarios = [
    {
      name: 'missing chain',
      mutate(envelope) {
        envelope.delegationChain = [];
      },
      blocker: 'delegation_root_invalid',
    },
    {
      name: 'wrong root',
      mutate(envelope) {
        envelope.delegationChain[0] = 'campaign-agent';
      },
      blocker: 'delegation_root_invalid',
    },
    {
      name: 'unknown agent',
      mutate(envelope) {
        envelope.delegationChain.push('live-provider-agent');
      },
      blocker: 'delegation_agent_invalid',
    },
    {
      name: 'wrong shape',
      mutate(envelope) {
        envelope.delegationChain = 'juss-chief-ai';
      },
      blocker: 'invalid_delegation_chain',
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const envelope = clone(safe);
      scenario.mutate(envelope);
      const result = runAdversarialSimulation(envelope);
      assert.equal(result.simulatorInvoked, false);
      assert.ok(result.blockers.includes(scenario.blocker));
    });
  }
});

test('requires unique valid Reality and Governance votes', async (t) => {
  const safe = await loadSafeEnvelope();
  const scenarios = [
    {
      name: 'no votes',
      mutate(envelope) {
        envelope.agentVotes = [];
      },
      blocker: 'agent_votes_incomplete',
    },
    {
      name: 'missing governance',
      mutate(envelope) {
        envelope.agentVotes = [envelope.agentVotes[0]];
      },
      blocker: 'agent_votes_incomplete',
    },
    {
      name: 'unknown voter',
      mutate(envelope) {
        envelope.agentVotes[1].agent = 'publisher-agent';
      },
      blocker: 'invalid_agent_vote',
    },
    {
      name: 'invalid decision',
      mutate(envelope) {
        envelope.agentVotes[1].decision = 'maybe';
      },
      blocker: 'invalid_agent_vote',
    },
    {
      name: 'duplicate voter',
      mutate(envelope) {
        envelope.agentVotes.push(clone(envelope.agentVotes[0]));
      },
      blocker: 'duplicate_agent_vote',
    },
    {
      name: 'wrong shape',
      mutate(envelope) {
        envelope.agentVotes = 'allow';
      },
      blocker: 'invalid_agent_votes',
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const envelope = clone(safe);
      scenario.mutate(envelope);
      const result = runAdversarialSimulation(envelope);
      assert.equal(result.simulatorInvoked, false);
      assert.ok(result.blockers.includes(scenario.blocker));
    });
  }
});

test('requires canonical UTC proof times and array-shaped history', async () => {
  const safe = await loadSafeEnvelope();
  const envelope = clone(safe);
  envelope.observedAt = 'August 1, 2026 4:00 PM';
  envelope.consumedApprovalIds = 'synthetic-approval-adversarial-001';
  envelope.seenCampaignKeys = 'synthetic-founder-project';

  const result = runAdversarialSimulation(envelope);

  assert.equal(result.simulatorInvoked, false);
  assert.ok(result.blockers.includes('proof_time_invalid'));
  assert.ok(result.blockers.includes('invalid_consumed_approvals'));
  assert.ok(result.blockers.includes('invalid_campaign_history'));
});

test('quarantines non-array receipt claims instead of ignoring them', async () => {
  const safe = await loadSafeEnvelope();
  const envelope = clone(safe);
  envelope.claimedReceipts = {
    provider: 'live-buffer',
    publicUrl: 'https://public.example.test/forged',
  };

  const result = runAdversarialSimulation(envelope);

  assert.equal(result.status, 'quarantined');
  assert.equal(result.phase, 'postflight');
  assert.equal(result.simulatorInvoked, true);
  assert.ok(result.blockers.includes('receipt_claim_invalid'));
});
