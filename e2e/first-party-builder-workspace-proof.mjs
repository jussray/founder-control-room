/**
 * Isolated browser proof for the first-party FCR builder.
 * HTTP responses are synthetic: this does not prove live provider execution.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const source = await readFile(new URL('../public/control-room/github-workspace.html', import.meta.url), 'utf8');
const SHA = 'a'.repeat(40);
const calls = { propose: 0, patch: 0 };
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
    reply(403, { error: 'No writes in browser proof' });
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
    assert.equal(calls.patch, 0, 'generation must not commit');
    await page.locator('#stage-ai-proposal').click();
    assert.equal(await page.locator('#file-content').inputValue(), 'export const ready = true;\n');
    assert.equal(calls.patch, 0, 'staging must not commit');
    assert.equal(await page.locator('#stage-ai-proposal').isEnabled(), false);
    assert.match(await page.locator('#ai-proposal-status').innerText(), /No commit or tests have run/);
    await page.close();
  }
  assert.equal(calls.propose, 2);
  assert.equal(calls.patch, 0);
  console.log(JSON.stringify({
    result: 'PASS', contract: 'fcr/first-party-builder-playwright@v1',
    viewports: ['390x844', '1280x800'], proposed: calls.propose, writes: calls.patch,
    source: 'repository-owned HTML', backend: 'synthetic local HTTP only',
  }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
