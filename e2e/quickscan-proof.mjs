import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../public/control-room');
const prospect = {
  id: 'prospect_demo', businessName: 'Glow Studio', ownerName: 'Maya', segment: 'salon_studio_team_owner', lifecycleState: 'draft_ready',
  evidence: [{ id: 'e1', category: 'visible_friction', note: 'Customers ask about availability in comments.', observedAt: new Date().toISOString() }],
  score: { total: 8 }, qualification: undefined,
  chiefRecommendation: { nextAction: 'approve_outreach', messageDraft: 'Hey Maya — when you are busy with clients, does keeping up with booking requests ever become difficult?', promptWorkflow: { workflowId: 'quickscan-outreach-v1' } },
  approvals: [{ id: 'approval_1', action: 'outreach', proposedAction: 'Send question-first Instagram opener', reason: 'Observable pain', evidenceIds: ['e1'], recommendedBy: 'chief', decision: 'PENDING' }],
  overrideReceipts: [], payment: { status: 'unpaid', amountCents: 24900 }, audit: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
let decisions = [];
const server = createServer(async (req, res) => {
  if (req.url === '/control-room/quickscan.html') { res.setHeader('content-type','text/html'); return res.end(await readFile(resolve(publicDir,'quickscan.html'))); }
  if (req.url === '/control-room/quickscan.css') { res.setHeader('content-type','text/css'); return res.end(await readFile(resolve(publicDir,'quickscan.css'))); }
  if (req.url === '/control-room/quickscan.js') { res.setHeader('content-type','text/javascript'); return res.end(await readFile(resolve(publicDir,'quickscan.js'))); }
  if (req.url === '/quickscan' && req.method === 'GET') { res.setHeader('content-type','application/json'); return res.end(JSON.stringify({ contract:'founder-control-room/quickscan@v1', authority:{ sendExternal:false, executeN8n:false, stripeWebhookConfigured:false, chiefConfigured:false }, prospects:[prospect] })); }
  if (req.url?.includes('/approvals/approval_1/decision') && req.method === 'POST') {
    let body=''; for await (const chunk of req) body += chunk; decisions.push(JSON.parse(body));
    prospect.approvals[0].decision = decisions.at(-1).decision;
    res.setHeader('content-type','application/json'); return res.end(JSON.stringify({ ok:true, prospect }));
  }
  res.statusCode=404; res.end('not found');
});
await new Promise((resolveReady) => server.listen(0,'127.0.0.1',resolveReady));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('server address unavailable');
const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
const page = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
try {
  await page.goto(`http://127.0.0.1:${address.port}/control-room/quickscan.html`, { waitUntil:'networkidle' });
  const truth = await page.locator('#truth').innerText();
  assert.match(truth, /External send: disabled/);
  assert.match(truth, /n8n execution: disabled/);
  assert.match(truth, /Stripe webhook: not configured/);
  assert.match(truth, /Chief AI: not configured/);
  await page.locator('[data-id="prospect_demo"]').click();
  const detailText = await page.locator('#detail').innerText();
  assert.match(detailText, /Prompt provenance: quickscan-outreach-v1/);
  assert.match(detailText, /Chief-proposed/);
  assert.equal(await page.locator('#chiefButton').isDisabled(), true);
  assert.equal(await page.locator('[data-decision="APPROVE"]').count(), 1);
  assert.equal(await page.locator('[data-decision="EDIT"]').count(), 1);
  assert.equal(await page.locator('[data-decision="SKIP"]').count(), 1);
  await page.locator('[data-decision="APPROVE"]').click();
  await page.waitForTimeout(50);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].decision, 'APPROVE');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  console.log(JSON.stringify({ ok:true, route:'/control-room/quickscan.html', approvalDecision:decisions[0], externalSend:false, n8nExecution:false }, null, 2));
} finally {
  await browser.close(); server.close();
}
