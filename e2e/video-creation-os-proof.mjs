import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const publicRoot = resolve('public');
const proofRoot = resolve('artifacts/video-creation-os');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

function safePath(pathname) {
  const requested = pathname === '/' ? '/control-room/video-creation-os.html' : decodeURIComponent(pathname);
  const filePath = resolve(publicRoot, `.${requested}`);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) return null;
  return filePath;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const filePath = safePath(url.pathname);
    if (!filePath) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': mime.get(extname(filePath)) ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('video creation OS proof server failed to bind');
const origin = `http://127.0.0.1:${address.port}`;
await mkdir(proofRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const cases = [
  { name: 'desktop', viewport: { width: 1365, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } }
];

try {
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport: testCase.viewport });
    const page = await context.newPage();
    await page.goto(`${origin}/control-room/video-creation-os.html`, { waitUntil: 'networkidle' });

    if ((await page.title()) !== 'Video Creation OS | Founder Control Room') throw new Error(`${testCase.name}: wrong page title`);
    const root = page.getByTestId('video-creation-os');
    if ((await root.getAttribute('data-contract')) !== 'l99/video-creation-os@v1') throw new Error(`${testCase.name}: contract marker missing`);
    if (await page.locator('[data-os-category]').count() !== 9) throw new Error(`${testCase.name}: expected nine creator layers`);

    await page.locator('[data-os-category="camera"]').selectOption('/pushin');
    await page.locator('[data-os-category="angle"]').selectOption('/shoulder');
    await page.locator('[data-os-category="composition"]').selectOption('/thirdgrid');
    await page.locator('[data-os-category="focus"]').selectOption('/isolatefocus');
    await page.locator('[data-os-category="color"]').selectOption('/coalteal');
    await page.locator('[data-os-category="lighting"]').selectOption('/rimlight');
    await page.getByRole('button', { name: 'Compile FCR handoff' }).click();

    const prompt = await page.getByTestId('compiled-prompt').innerText();
    for (const command of ['/pushin', '/shoulder', '/thirdgrid', '/isolatefocus', '/coalteal', '/rimlight']) {
      if (!prompt.includes(command)) throw new Error(`${testCase.name}: compiled prompt missing ${command}`);
    }
    if (!prompt.includes('Preserve truth boundaries')) throw new Error(`${testCase.name}: truth boundary missing from prompt`);

    const handoffText = await page.locator('[data-os-json]').innerText();
    const handoff = JSON.parse(handoffText);
    if (handoff.contract !== 'fcr/video-creation-handoff@v1') throw new Error(`${testCase.name}: wrong handoff contract`);
    if (handoff.video_creation_os_contract !== 'l99/video-creation-os@v1') throw new Error(`${testCase.name}: wrong OS contract`);
    if (handoff.workflow !== 'LEEVIZE') throw new Error(`${testCase.name}: LEEVIZE workflow not preserved`);
    if (handoff.target !== 'story-engine/shot-dna@v1') throw new Error(`${testCase.name}: StoryEngine target missing`);
    if (handoff.authority.plan !== true) throw new Error(`${testCase.name}: planning authority missing`);
    for (const key of ['render', 'spend', 'publish', 'merge', 'deploy', 'truth_reclassification']) {
      if (handoff.authority[key] !== false) throw new Error(`${testCase.name}: ${key} authority must remain false`);
    }
    if (handoff.selections.length !== 6) throw new Error(`${testCase.name}: compiled selection count drifted`);

    const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    if (overflow.scroll > overflow.client + 1) throw new Error(`${testCase.name}: horizontal overflow ${overflow.scroll} > ${overflow.client}`);

    await page.screenshot({ path: resolve(proofRoot, `${testCase.name}.png`), fullPage: true });
    await context.close();
  }
  console.log('VIDEO_CREATION_OS_PLAYWRIGHT_PROOF=PASS');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
