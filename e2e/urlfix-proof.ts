import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright';

import {
  createUrlFixWitnessFingerprint,
  evaluateUrlFixVerificationReceipt,
  type UrlFixArtifactRef,
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
};

interface FixtureRuntime {
  server: Server;
  origin: string;
  runtimeIdentity: string;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function artifact(id: string, path: string): UrlFixArtifactRef {
  return { id, sha256: sha256File(path) };
}

async function startFixtureRuntime(mode: 'broken' | 'repaired'): Promise<FixtureRuntime> {
  const runtimeIdentity = mode === 'broken' ? 'fixture-runtime-before' : 'fixture-runtime-after';
  const server = createServer((request, response) => {
    response.setHeader('x-runtime-identity', runtimeIdentity);
    if (request.url === '/api/checkout') {
      response.statusCode = mode === 'broken' ? 500 : 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: mode === 'repaired' }));
      return;
    }

    if (request.url === '/cart') {
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html><body><main>
<h1>Fixture cart</h1><button id="checkout">Checkout</button><p id="status">idle</p>
</main><script>
document.querySelector('#checkout').addEventListener('click', async () => {
  const res = await fetch('/api/checkout', { method: 'POST' });
  document.querySelector('#status').textContent = res.ok ? 'checkout-ready' : 'checkout-error';
});
</script></body></html>`);
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
    const targetUrl = `${runtime.origin}${witnessSpec.route}`;
    await page.goto(targetUrl, { waitUntil: 'load' });
    await page.locator('#checkout').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent !== 'idle');
    const observedResult = (await page.locator('#status').textContent())?.trim() || '';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.tracing.stop({ path: tracePath });

    return {
      runId,
      witnessFingerprint: createUrlFixWitnessFingerprint(witnessSpec),
      target: 'LOCAL',
      targetUrl,
      runtimeIdentity: runtime.runtimeIdentity,
      runtimeEvidenceRef: null,
      evidenceMode: 'FIXTURE',
      observedResult,
      trace: artifact(`trace:${runId}`, tracePath),
      screenshot: artifact(`screenshot:${runId}`, screenshotPath),
    };
  } finally {
    await browser.close();
  }
}

const brokenRuntime = await startFixtureRuntime('broken');
const beforeRun = await runWitness(brokenRuntime, 'before-run');
await stopFixtureRuntime(brokenRuntime);
if (beforeRun.observedResult !== 'checkout-error') throw new Error(`expected failing witness, observed ${beforeRun.observedResult}`);

const repairedRuntime = await startFixtureRuntime('repaired');
const afterRun = await runWitness(repairedRuntime, 'after-run');
await stopFixtureRuntime(repairedRuntime);

const receipt: UrlFixVerificationReceipt = {
  issueId: 'URLFIX-9001',
  witnessSpec,
  before: beforeRun,
  after: afterRun,
};

const verifiedArtifactIds = new Set([
  beforeRun.trace?.id,
  afterRun.trace?.id,
].filter((value): value is string => Boolean(value)));

const decision = evaluateUrlFixVerificationReceipt(receipt, {
  verifiedArtifactIds,
  verifiedRuntimeEvidenceRefs: new Set(),
});

if (!decision.validSameWitness || decision.proofState !== 'LOCAL_BROWSER_PROVEN' || decision.errors.length > 0) {
  throw new Error(`unexpected URLFix local proof decision: ${JSON.stringify(decision)}`);
}

const falseLiveDecision = evaluateUrlFixVerificationReceipt({
  ...receipt,
  before: {
    ...beforeRun,
    target: 'LIVE',
    targetUrl: 'https://example.invalid/cart',
    evidenceMode: 'FIXTURE',
  },
  after: {
    ...afterRun,
    target: 'LIVE',
    targetUrl: 'https://example.invalid/cart',
    evidenceMode: 'FIXTURE',
    runtimeIdentity: 'pretend-live-runtime',
    runtimeEvidenceRef: 'pretend-runtime-receipt',
  },
}, {
  verifiedArtifactIds,
  verifiedRuntimeEvidenceRefs: new Set(['pretend-runtime-receipt']),
});

if (falseLiveDecision.proofState === 'LIVE_BROWSER_PROVEN') {
  throw new Error('fixture evidence was incorrectly promoted to LIVE_BROWSER_PROVEN');
}

writeFileSync(join(proofDir, 'receipt.json'), JSON.stringify({
  schema: 'juss/urlfix-playwright-contract-proof@v2',
  witnessFingerprint: createUrlFixWitnessFingerprint(witnessSpec),
  beforeRun,
  afterRun,
  decision,
  falseLiveDecision,
}, null, 2));

console.log(`URLFix Playwright contract proof passed: ${decision.proofState}`);
