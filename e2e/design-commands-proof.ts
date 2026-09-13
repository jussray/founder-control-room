import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';

import {
  DESIGN_COMMAND_DECK_CONTRACT,
  DESIGN_COMMAND_SHARED_CAPABILITY,
  DESIGN_COMMANDS,
} from '../src/design-os/commands.js';
import {
  buildDesignOsSummary,
  PORTFOLIO_DESIGN_REGISTRY,
} from '../src/design-os/registry.js';

const PAGE_PATH = new URL('../public/control-room/design-commands.html', import.meta.url);
const CONTROL_ROOM_PATH = new URL('../public/control-room/index.html', import.meta.url);
const html = await readFile(PAGE_PATH, 'utf8');
const controlRoomHtml = await readFile(CONTROL_ROOM_PATH, 'utf8');
await mkdir(new URL('../logs/', import.meta.url), { recursive: true });

const commandContract = {
  contract: DESIGN_COMMAND_DECK_CONTRACT,
  count: DESIGN_COMMANDS.length,
  sharedCapability: DESIGN_COMMAND_SHARED_CAPABILITY,
  commandsAreOperationsNotAuthority: true,
  mutatingCommandsRequireFounderApproval: true,
  uiRuntimeClaimsRequireExactHeadPlaywright: true,
  productNativeGrammarRequired: true,
  scopeOwnershipIsExclusiveByDefault: true,
};

const server = createServer((req, res) => {
  const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (requestUrl.pathname === '/control-room/design-commands.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (requestUrl.pathname === '/control-room/' || requestUrl.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(controlRoomHtml);
    return;
  }

  if (requestUrl.pathname === '/design-os') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      summary: buildDesignOsSummary(),
      projects: PORTFOLIO_DESIGN_REGISTRY,
      commands: DESIGN_COMMANDS,
      commandContract,
      truthBoundaries: {
        figmaIsNotRuntimeProof: true,
        designApprovalDoesNotAuthorizeImplementation: true,
        implementationDoesNotAuthorizeDeployment: true,
        noApprovalCarriesAcrossProjects: true,
      },
    }));
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Design Commands proof server did not bind a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PLAYWRIGHT_PROOF_FAILED: ${message}`);
  console.log(`ok - ${message}`);
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} has no horizontal overflow (${dimensions.scrollWidth} <= ${dimensions.clientWidth + 1})`,
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await desktop.goto(`${baseUrl}/control-room/`, { waitUntil: 'domcontentloaded' });
  await desktop.locator('.launch-dock summary').click();
  const projectDesignLink = desktop.locator('[data-project-design-commands]');
  assert(await projectDesignLink.isVisible(), 'Projects Control Room exposes the 23 Design Commands entry point');
  await projectDesignLink.click();
  await desktop.locator('[data-command-id="intent"]').waitFor();
  assert(new URL(desktop.url()).pathname === '/control-room/design-commands.html', 'Projects Control Room opens the canonical Design Commands surface');

  assert(await desktop.locator('.design-command-card').count() === 23, 'desktop renders exactly 23 command cards');
  assert(await desktop.locator('[data-command-id="layout"] .slash').innerText() === '/layout', 'desktop exposes /layout');
  assert(await desktop.locator('#project-select option').count() === 7, 'project selector exposes all seven Design OS projects');
  assert(await desktop.locator('#contract-law').innerText().then((text) => text.includes('control-room-design-implementation')), 'shared capability boundary is visible');

  await desktop.goto(`${baseUrl}/control-room/design-commands.html?project=sekret-bip`, { waitUntil: 'networkidle' });
  await desktop.locator('[data-command-id="intent"]').waitFor();
  assert(await desktop.locator('#project-select').inputValue() === 'sekret-bip', 'project query binds the command deck to Se\'kret Bip');

  await desktop.fill('#command-target', 'welcome screen');
  await desktop.click('[data-prepare-command="layout"]');
  const prepared = await desktop.locator('#prepared-command').innerText();
  assert(prepared.includes('/layout'), 'prepared handoff preserves selected slash command');
  assert(prepared.includes('project:sekret-bip'), 'prepared handoff binds the selected project');
  assert(prepared.includes('target:welcome screen'), 'prepared handoff binds the target surface');

  await desktop.fill('#command-search', '/recovery');
  assert(await desktop.locator('.design-command-card').count() === 1, 'slash search narrows the deck to /recovery');
  assert(await desktop.locator('[data-command-id="recovery"]').isVisible(), '/recovery remains visible after filtering');
  await desktop.fill('#command-search', '');
  assert(await desktop.locator('.design-command-card').count() === 23, 'clearing search restores all 23 commands');
  await assertNoHorizontalOverflow(desktop, 'desktop');
  await desktop.screenshot({ path: new URL('../logs/design-commands-desktop.png', import.meta.url).pathname, fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${baseUrl}/control-room/design-commands.html?project=founder-control-room`, { waitUntil: 'networkidle' });
  await mobile.locator('[data-command-id="prove"]').waitFor();
  assert(await mobile.locator('.design-command-card').count() === 23, 'mobile renders exactly 23 command cards');
  assert(await mobile.locator('#project-select').inputValue() === 'founder-control-room', 'mobile preserves explicit project context');
  assert(await mobile.locator('[data-command-id="accessibility"]').isVisible(), 'mobile exposes /accessibility');
  assert(await mobile.locator('[data-prepare-command="prove"]').isVisible(), 'mobile exposes /prove preparation control');
  await assertNoHorizontalOverflow(mobile, 'mobile');
  await mobile.screenshot({ path: new URL('../logs/design-commands-mobile.png', import.meta.url).pathname, fullPage: true });

  console.log('Playwright Design Commands proof passed.');
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
