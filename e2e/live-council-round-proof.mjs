import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { runCouncilRound } from '../dist/lib/councilRound.js';
import { buildOperatorRelayResponse } from '../dist/lib/operatorRelayProviderResult.js';

const seen = [];
const adapter = (label, evidenceRef) => async (request) => {
  seen.push({ source: request.fromOperator, target: request.toOperator, context: request.context.summary });
  return buildOperatorRelayResponse(request, {
    answer: `${label} contribution`,
    evidenceRefs: [evidenceRef],
    completedAt: new Date().toISOString(),
  });
};

// Deliberately simulated adapters. This proves browser transport and lineage,
// not live external-provider reachability or provider receipts.
const adapters = {
  codex: adapter('Codex', 'simulated:openai:browser-proof'),
  'claude-code': adapter('Claude', 'simulated:anthropic:browser-proof'),
  'meta-ai': adapter('Meta AI', 'simulated:meta-ai:browser-proof'),
  muse: adapter('Muse', 'simulated:muse:browser-proof'),
};

const app = express();
app.use(express.json());
app.get('/', (_req, res) => res.type('html').send('<!doctype html><title>Council relay proof</title><main>Council relay proof</main>'));
app.post('/proof', async (req, res) => {
  const row = await runCouncilRound({
    goal: req.body.goal,
    initiator: 'fcr',
    sourceRef: 'founder-attested:claude-code',
    seed: req.body.seed,
    seats: [
      { operator: 'codex', capability: 'propose' },
      { operator: 'claude-code', capability: 'propose' },
      { operator: 'meta-ai', capability: 'propose' },
      { operator: 'muse', capability: 'propose' },
    ],
  }, adapters);
  res.json(row);
});

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('proof server did not bind');
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
try {
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const response = await fetch('/proof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Return one bounded Council recommendation.', seed: 'Claude-originated seed.' }),
    });
    return { status: response.status, body: await response.json() };
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.transcript.state, 'complete');
  assert.equal(result.body.transcript.humanRelay, false);
  assert.equal(result.body.transcript.sourceRef, 'founder-attested:claude-code');
  assert.deepEqual(seen.map(({ source, target }) => `${source}>${target}`), [
    'fcr>codex', 'codex>claude-code', 'claude-code>meta-ai', 'meta-ai>muse',
  ]);
  const hops = result.body.transcript.hops;
  assert.equal(hops.length, 4);
  for (let i = 1; i < hops.length; i += 1) assert.equal(hops[i].inputSha256, hops[i - 1].answerSha256);
  assert.equal(hops.every((hop) => hop.liveProviderEvidence === false), true);

  console.log(JSON.stringify({
    contract: 'fcr/live-council-browser-proof@v1',
    status: 'PASS',
    witness: 'browser_functional',
    liveProviderProof: false,
    sourceRef: result.body.transcript.sourceRef,
    chain: seen.map(({ source, target }) => `${source}>${target}`),
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
