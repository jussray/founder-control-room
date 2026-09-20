import assert from 'node:assert/strict';

const relayOperators = ['gemini', 'codex', 'claude-code', 'perplexity'];
const instructorOnly = 'deepseek-instructor';

function relayEnvelope(fromOperator, toOperator) {
  assert(relayOperators.includes(fromOperator), 'source must be a peer operator');
  assert(relayOperators.includes(toOperator), 'target must be a peer operator');
  assert.notEqual(fromOperator, toOperator, 'relay requires distinct operators');
  return {
    fromOperator,
    toOperator,
    authority: {
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    },
  };
}

const gemini = relayEnvelope('codex', 'gemini');
assert.equal(gemini.toOperator, 'gemini');
assert.deepEqual(Object.values(gemini.authority), [false, false, false, false, false]);

const perplexity = relayEnvelope('codex', 'perplexity');
assert.equal(perplexity.toOperator, 'perplexity');
assert.deepEqual(Object.values(perplexity.authority), [false, false, false, false, false]);

const claude = relayEnvelope('perplexity', 'claude-code');
assert.equal(claude.toOperator, 'claude-code');

assert.throws(() => relayEnvelope('codex', instructorOnly), /target must be a peer operator/);

console.log(JSON.stringify({
  contract: 'fcr/operator-relay-playwright-preflight@v1',
  peerOperators: relayOperators,
  instructorLane: instructorOnly,
  canonicalPath: '/mcp',
  standaloneHttpRoute: 'UNMOUNTED_TEST_SCAFFOLD',
  authorityEscalation: false,
  status: 'SOURCE_WIRED_LIVE_UNPROVEN',
  nextGate: 'same-head deployed runtime + OAuth-bound operator client + real provider evidence + founder-visible Playwright round-trip',
}, null, 2));
