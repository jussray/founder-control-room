/**
 * Isolated browser proof for the first-party FCR builder.
 * HTTP responses are synthetic: this does not prove live provider execution.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const source = await readFile(new URL('../public/control-room/github-workspace.html', import.meta.url), 'utf8');
const SHA = 'a'.repeat(40);
const calls = { propose: 0, patch: 0 };
const digest = (content) => createHash('sha256').update(content).digest('hex');
const patchBodies = [];
const server = createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  function reply(status, body) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  if (req.method === 'GET' && path === '/control-room/github-workspace.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(source);
    return;
  }
  if (req.method === 'POST' && path === '/prompt-workflows/propose') {
    calls.propose += 1;
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    assert.deepEqual(input, {
      projectSlug: 'founder-control-room',
      ref: 'mission/verified-source',
      path: 'src/example.ts',
      goal: 'Change the one ready flag and preserve all other behavior.',
    });
    reply(200, {
      contract: 'fcr/first-party-build-proposal@v1',
      status: 'proposal_only',
      proposal: {
        projectSlug: input.projectSlug, repository: 'jussray/founder-control-room',
        ref: input.ref, path: input.path, exactSha: SHA,
        beforeSha256: digest('export const ready = false;\n'),
        afterSha256: digest('export const ready = true;\n'),
        content: 'export const ready = true;\n',
        summary: 'Change only the ready flag.',
      },
      provenance: { provider: 'synthetic-playwright-test' },
      authority: { repositoryWrite: false, merge: false, deploy: false },
    });
    return;
  }
  if (req.method === 'POST' && path.startsWith('/approvals/')) {
    calls.patch += 1;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    patchBodies.push({ path, body: JSON.parse(raw) });
    reply(409, { error: 'Synthetic mission source is stale; no provider write occurred' });
    return;
  }
  reply(404, { error: 'Not part of this isolated test' });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto('http://127.0.0.1:' + server.address().port + '/control-room/github-workspace.html');
    await page.locator('#project-slug').fill('founder-control-room');
    await page.locator('#read-ref').fill('mission/verified-source');
    await page.locator('#file-path').fill('src/example.ts');
    await page.locator('#ai-goal').fill('Change the one ready flag and preserve all other behavior.');
    await page.locator('#request-ai-proposal').click();
    await page.locator('#ai-proposal-preview:visible').waitFor();
    assert.equal(await page.locator('#ai-proposal-preview').inputValue(), 'export const ready = true;\n');
    assert.equal(await page.locator('#file-content').inputValue(), '', 'generation must not edit source');
    assert.equal(await page.locator('#stage-ai-proposal').isEnabled(), true);
    const patchCountBefore = calls.patch;
    assert.equal(calls.patch, patchCountBefore, 'generation must not commit');
    await page.locator('#stage-ai-proposal').click();
    assert.equal(await page.locator('#file-content').inputValue(), 'export const ready = true;\n');
    assert.equal(calls.patch, patchCountBefore, 'staging must not commit');
    assert.equal(await page.locator('#stage-ai-proposal').isEnabled(), false);
    assert.match(await page.locator('#ai-proposal-status').innerText(), /No commit, CI, or Playwright proof has run/);
    await page.locator('#mission-id').fill('mission-proof-id');
    // Mutating the preview after staging must block before the HTTP mutation.
    await page.locator('#file-content').fill('export const ready = tampered;\n');
    await page.locator('#commit-patch').click();
    assert.match(await page.locator('#result').innerText(), /staged AI candidate or repository target changed/);
    assert.equal(calls.patch, patchCountBefore);
    // Exact unchanged candidate hands a fingerprint-bound receipt to the
    // existing patch endpoint; the synthetic backend deliberately refuses it.
    await page.locator('#file-content').fill('export const ready = true;\n');
    await page.locator('#commit-patch').click();
    await page.waitForFunction(() => document.getElementById('result')?.textContent?.includes('Synthetic mission source is stale; no provider write occurred'));
    assert.equal(calls.patch, patchCountBefore + 1, 'only explicit commit may attempt a patch');
    const submission = patchBodies.at(-1);
    assert.equal(submission.path, '/approvals/mission-proof-id/patch');
    assert.deepEqual(submission.body.changes, [{ path: 'src/example.ts', content: 'export const ready = true;\n' }]);
    assert.equal(typeof submission.body.idempotencyKey, 'string');
    assert.deepEqual(submission.body.stagedWorkspaceReceipt, {
      version: 'founder-os-virtual-workspace-edit-v1',
      status: 'staged',
      mode: 'in-memory-only',
      sourceClassification: 'repository-source',
      repository: 'jussray/founder-control-room',
      branch: 'mission/verified-source',
      sourceSha: SHA,
      changes: [{
        path: 'src/example.ts',
        beforeSha256: digest('export const ready = false;\n'),
        afterSha256: digest('export const ready = true;\n'),
      }],
      providerCalls: false,
      filesystemWrites: false,
      sourceBranchWrites: false,
      externalExecutionAllowed: false,
    });
    await page.close();
  }
  assert.equal(calls.propose, 2);
  assert.equal(calls.patch, 2, 'one explicit refused request for each viewport');
  console.log(JSON.stringify({
    result: 'PASS', contract: 'fcr/first-party-builder-playwright@v1',
    viewports: ['390x844', '1280x800'], proposed: calls.propose, patchAttempts: calls.patch, successfulWrites: 0,
    source: 'repository-owned HTML', backend: 'synthetic local HTTP only',
  }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
