import { chromium } from 'playwright';
import express from 'express';
import assert from 'node:assert/strict';
import { runLiveCouncilRelay } from '../dist/lib/councilRelay.js';
import { buildOperatorRelayResponse } from '../dist/lib/operatorRelayProviderResult.js';

const seen = [];
const adapter = (label, evidenceRef) => async (request) => {
  seen.push({ source: request.fromOperator, target: request.toOperator, context: request.context.summary });
  return buildOperatorRelayResponse(request, {
    answer: `${label} contribution`,
    evidenceRefs: [evidenceRef],
  });
};

const app = express();
app.use(express.json());
app.get('/', (_req, res) => res.type('html').send('<!doctype html><title>Live Council proof</title><main>Live Council proof</main>'));
app.post('/proof', async (req, res) => {
  const relay = await runLiveCouncilRelay(req.body, {
    codex: adapter('Codex', 'provider:openai:proof-1'),
    'claude-code': adapter('Claude', 'provider:anthropic:proof-2'),
    muse: adapter('Muse', 'provider:muse:proof-3'),
  });
  res.json(relay);
});

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('proof server did not bind a TCP port');
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
try {
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const response = await fetch('/proof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: 'Return one bounded Council recommendation.',
        contextSummary: 'Browser-originated Council orchestration proof.',
        participants: ['codex', 'claude-code', 'muse'],
      }),
    });
    return { status: response.status, body: await response.json() };
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'completed');
  assert.deepEqual(result.body.completedParticipants, ['codex', 'claude-code', 'muse']);
  assert.equal(result.body.finalAnswer, 'Muse contribution');
  assert.equal(seen[0]?.source, 'fcr');
  assert.equal(seen[0]?.target, 'codex');
  assert.equal(seen[1]?.source, 'codex');
  assert.equal(seen[1]?.target, 'claude-code');
  assert.match(seen[1]?.context ?? '', /codex: Codex contribution/);
  assert.equal(seen[2]?.source, 'claude-code');
  assert.equal(seen[2]?.target, 'muse');
  assert.match(seen[2]?.context ?? '', /claude-code: Claude contribution/);

  console.log(JSON.stringify({
    contract: 'fcr/live-council-playwright-proof@v1',
    status: 'PASS',
    witness: 'browser_functional',
    liveProviderProof: false,
    chain: seen.map(({ source, target }) => `${source}->${target}`),
    finalSeat: result.body.completedParticipants.at(-1),
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
