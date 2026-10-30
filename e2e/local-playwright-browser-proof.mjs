import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const COST_CLASS = 'LOCAL_NO_PROVIDER_FEE';
const outputDir = path.resolve('artifacts/browser/local-playwright');
const screenshotPath = path.join(outputDir, 'local-playwright-proof.png');
const receiptPath = path.join(outputDir, 'local-playwright-proof.json');

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html>
    <html>
      <body>
        <form id="proof-form">
          <label for="message">Message</label>
          <input id="message" name="message" />
          <button type="submit">Submit approved payload</button>
        </form>
        <p id="status">not submitted</p>
        <script>
          document.querySelector('#proof-form').addEventListener('submit', (event) => {
            event.preventDefault();
            document.querySelector('#status').textContent = 'fixture event observed';
          });
        </script>
      </body>
    </html>`);

  await page.getByLabel('Message').fill('approved payload');
  await page.getByRole('button', { name: 'Submit approved payload' }).click();
  await page.getByText('fixture event observed').waitFor();

  const status = await page.locator('#status').textContent();
  assert.equal(status, 'fixture event observed');

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const receipt = {
    contract: 'fcr/local-playwright-browser-fixture@v2',
    engine: 'playwright',
    executionMode: 'local',
    evidenceScope: 'synthetic-dom-fixture',
    costClass: COST_CLASS,
    providerWalletRequired: false,
    fixtureFormMutationProved: true,
    formMutationProved: false,
    providerAccepted: false,
    verifiedOutcome: false,
    screenshot: path.relative(process.cwd(), screenshotPath),
  };

  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
}
