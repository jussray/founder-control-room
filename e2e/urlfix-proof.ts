import { createServer, type Server } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright';

import {
  createUrlFixWitnessFingerprint,
  evaluateUrlFixVerificationReceipt,
  type UrlFixVerificationReceipt,
  type UrlFixWitnessRun,
  type UrlFixWitnessSpec,
} from '../src/lib/urlfix.js';

const proofDir = resolve(process.env.URLFIX_PROOF_DIR || 'test-results/urlfix-proof');
mkdirSync(proofDir, { recursive: true });

const witnessSpec: UrlFixWitnessSpec = {
  route: '/cart',
  viewport: { width: 390, height: 844 },
  preconditions: ['fixture cart contains one item'],
  actions: ['open /cart', 'click Checkout'],
  expectedObservableResult: 'checkout-ready',
  dependencyMode: 'REAL',
};

interface FixtureRuntime {
  server: Server;
  origin: string;
  runtimeIdentity: string;
}

async function startFixtureRuntime(mode: 'broken' | 'repaired'): Promise<FixtureRuntime> {
  const runtimeIdentity = mode === 'broken' ? 'fixture-runtime-before' : 'fixture-runtime-after';
  const server = createServer((request, response) => {
    response.setHeader('x-runtime-identity', runtimeIdentity);
    if (request.url === '/api/checkout') {
      if (mode === 'broken') {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: false }));
      } else {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      }
      return;
    }

    if (request.url === '/cart') {
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<!doctype html>
<html>
  <body>
    <main>
      <h1>Fixture cart</h1>
      <button id="checkout">Checkout</button>
      <p id="status">idle</p>
    </main>
    <script>
      document.querySelector('#checkout').addEventListener('click', async () => {
        const res = await fetch('/api/checkout', { method: 'POST' });
        document.querySelector('#status').textContent = res.ok ? 'checkout-ready' : 'checkout-error';
      });
    </script>
  </body>
</html>`);
      return;
    }

    response.statusCode = 404;
    response.end('not found');
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not expose a TCP address');
  return { server, origin: `http://127.0.0.1:${address.port}`, runtimeIdentity };
}

async function stopFixtureRuntime(runtime: FixtureRuntime): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    runtime.server.close((error) => error ? reject(error) : resolveClose());
  });
}

async function runWitness(runtime: FixtureRuntime, runId: string): Promise<UrlFixWitnessRun> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: witnessSpec.viewport });
  const tracePath = join(proofDir, `${runId}.trace.zip`);
  const screenshotPath = join(proofDir, `${runId}.png`);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();

  try {
    await page.goto(`${runtime.origin}${witnessSpec.route}`, { waitUntil: 'load' });
    await page.locator('#checkout').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent !== 'idle');
    const observedResult = (await page.locator('#status').textContent())?.trim() || '';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.tracing.stop({ path: tracePath });

    return {
      runId,
      witnessFingerprint: createUrlFixWitnessFingerprint(witnessSpec),
      target: 'LOCAL',
      runtimeIdentity: runtime.runtimeIdentity,
      evidenceMode: 'REAL',
      observedResult,
      traceArtifactId: tracePath,
      screenshotArtifactId: screenshotPath,
    };
  } finally {
    await browser.close();
  }
}

const brokenRuntime = await startFixtureRuntime('broken');
const beforeRun = await runWitness(brokenRuntime, 'before-run');
await stopFixtureRuntime(brokenRuntime);

if (beforeRun.observedResult !== 'checkout-error') {
  throw new Error(`expected failing witness, observed ${beforeRun.observedResult}`);
}

const repairedRuntime = await startFixtureRuntime('repaired');
const afterRun = await runWitness(repairedRuntime, 'after-run');
await stopFixtureRuntime(repairedRuntime);

const receipt: UrlFixVerificationReceipt = {
  issueId: 'URLFIX-9001',
  witnessSpec,
  before: beforeRun,
  after: afterRun,
};

const decision = evaluateUrlFixVerificationReceipt(receipt);
if (!decision.validSameWitness || decision.proofState !== 'LOCAL_BROWSER_PROVEN' || decision.errors.length > 0) {
  throw new Error(`unexpected URLFix local proof decision: ${JSON.stringify(decision)}`);
}

const falseLiveDecision = evaluateUrlFixVerificationReceipt({
  ...receipt,
  after: {
    ...afterRun,
    target: 'LIVE',
    evidenceMode: 'FIXTURE',
    runtimeIdentity: 'pretend-live-runtime',
  },
});

if (falseLiveDecision.proofState === 'LIVE_BROWSER_PROVEN') {
  throw new Error('fixture evidence was incorrectly promoted to LIVE_BROWSER_PROVEN');
}

writeFileSync(join(proofDir, 'receipt.json'), JSON.stringify({
  schema: 'juss/urlfix-playwright-contract-proof@v1',
  witnessFingerprint: createUrlFixWitnessFingerprint(witnessSpec),
  beforeRun,
  afterRun,
  decision,
  falseLiveDecision,
}, null, 2));

console.log(`URLFix Playwright contract proof passed: ${decision.proofState}`);
