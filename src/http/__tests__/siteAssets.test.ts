import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Founder Control Room Cloudflare topology', () => {
  it('builds the browser frontend as a Cloudflare Pages artifact', () => {
    const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    const buildScript = read('scripts/build-pages.mjs');

    expect(packageJson.scripts?.['build:pages']).toBe('node scripts/build-pages.mjs');
    expect(packageJson.scripts?.['pages:dev']).toContain('wrangler pages dev dist-pages');
    expect(buildScript).toContain("resolve(repositoryRoot, 'public')");
    expect(buildScript).toContain("resolve(repositoryRoot, 'dist-pages')");
    expect(buildScript).toContain("'_worker.js'");
    expect(buildScript).toContain("'portable-founder-console/index.html'");
  });

  it('provides a root front door into the founder-authenticated app', () => {
    const landing = read('public/index.html');
    const app = read('public/control-room/index.html');

    expect(landing).toContain('href="/control-room/"');
    expect(landing).toContain('The four jobs');
    expect(landing).toContain('View safety boundary');
    expect(app).toContain('src="/control-room/app.js"');
    expect(existsSync(resolve(repoRoot, 'public/portable-founder-console/index.html'))).toBe(true);
  });

  it('turns the founder stack into a five-lane execution loop', () => {
    const app = read('public/control-room/index.html');
    const stackRouter = read('public/control-room/stack-router.js');

    expect(app).toContain('Every output fuels the next prompt');
    expect(app).toContain('data-lane="chat"');
    expect(app).toContain('data-lane="workflows"');
    expect(app).toContain('data-lane="code"');
    expect(app).toContain('data-lane="projects"');
    expect(app).toContain('data-lane="skills"');
    expect(app).toContain('Workflows output becomes the Code prompt');
    expect(app).not.toContain('Cowork');
    expect(app).not.toContain('data-lane="cowork"');
    expect(app).toContain('Terminal build/test');
    expect(app).toContain('href="/control-room/?tab=terminal"');
    expect(app).toContain('Create / Add to Project');
    expect(app).toContain('Consistent output becomes the next Chat prompt');
    expect(app).toContain('src="/control-room/stack-router.js"');

    expect(stackRouter).toContain("const PENDING_TAB_KEY = 'fcr_pending_tab'");
    expect(stackRouter).toContain("'terminal'");
    expect(stackRouter).toContain('.tabs button[data-tab=');
    expect(stackRouter).toContain('new MutationObserver');
  });

  it('routes founder content through Chief, exact Current You authorization, and provider truth', () => {
    const app = read('public/control-room/index.html');
    const contentManager = read('public/control-room/content-manager.html');
    const playwrightProof = read('e2e/content-manager-proof.mjs');

    expect(app).toContain('href="/control-room/content-manager.html"');
    expect(app).toContain('Content manager');
    expect(contentManager).toContain('First-party content shop');
    expect(contentManager).toContain('Post from your own product.');
    expect(contentManager).toContain('Chief AI is the story brain.');
    expect(contentManager).toContain('FCR is the authority boundary.');
    expect(contentManager).toContain('Internal evidence required');
    expect(contentManager).toContain('Sauce guard required');
    expect(contentManager).toContain('Public proof link optional');
    expect(contentManager).toContain('data-content-authority-state="awaiting-proposal"');
    expect(contentManager).toContain('data-public-proof-state="optional-off"');
    expect(contentManager).toContain('data-internal-evidence-state="unknown"');
    expect(contentManager).toContain('data-sauce-state="unknown"');
    expect(contentManager).toContain('data-provider-state="unknown"');
    expect(contentManager).toContain('data-outcome-state="unknown"');
    expect(contentManager).not.toContain('data-public-proof-link-toggle');
    expect(contentManager).not.toContain('Cambiante is the actuator');
    expect(contentManager).toContain('First-party authorization does not mean a provider write already happened.');
    expect(contentManager).toContain('Missing metrics stay UNKNOWN');
    expect(contentManager).toContain('analytics can never increase authority');

    const story = contentManager.indexOf('data-content-stage="story"');
    const verify = contentManager.indexOf('data-content-stage="verify"');
    const currentYou = contentManager.indexOf('data-content-stage="current-you"');
    const review = contentManager.indexOf('data-content-stage="review"');
    const provider = contentManager.indexOf('data-content-stage="provider"');
    const learning = contentManager.indexOf('data-content-stage="learning"');
    expect(story).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(story);
    expect(currentYou).toBeGreaterThan(verify);
    expect(review).toBeGreaterThan(currentYou);
    expect(provider).toBeGreaterThan(review);
    expect(learning).toBeGreaterThan(provider);

    expect(playwrightProof).toContain("viewport: { width: 390, height: 844 }");
    expect(playwrightProof).toContain("'content-manager-mobile.png'");
    expect(playwrightProof).toContain('page must not overflow the mobile viewport');
    expect(playwrightProof).toContain("data-content-authority-state");
    expect(playwrightProof).toContain("data-current-you-state");
    expect(playwrightProof).toContain("data-review-window-state");
    expect(playwrightProof).toContain("data-provider-state");
    expect(playwrightProof).toContain("data-outcome-state");
  });

  it('keeps browser API calls same-origin and rejects an unverified upstream', () => {
    const proxy = read('public/_worker.js');

    expect(proxy).toContain("const API_ORIGIN = 'https://api.foundercontrolroom.org'");
    expect(proxy).toContain("const EXPECTED_API_SERVICE = 'founder-control-room'");
    expect(proxy).toContain('STATIC_FILE_PATTERN');
    expect(proxy).toContain("'/control-room'");
    expect(proxy).toContain("'/portable-founder-console'");
    expect(proxy).toContain('if (shouldServeFromPages(request))');
    expect(proxy).toContain('return env.ASSETS.fetch(request)');
    expect(proxy).toContain("headers.set('x-forwarded-host', sourceUrl.host)");
    expect(proxy).toContain("redirect: 'manual'");
    expect(proxy).toContain('const response = await fetch(createApiRequest(request))');
    expect(proxy).toContain('const failureCode = upstreamFailureCode(response)');
    expect(proxy).toContain('API_SERVICE_IDENTITY_MISMATCH');
    expect(proxy).toContain('return failureCode ? degradedResponse(request, failureCode) : response');
  });

  it('deploys one API Worker and keeps Pages out of Worker configuration', () => {
    const worker = read('wrangler.worker.toml');

    expect(worker).toContain('name = "founder-control-room"');
    expect(worker).toContain('pattern = "api.foundercontrolroom.org"');
    expect(worker).toContain('FOUNDER_API_URL = "https://foundercontrolroom.org"');
    expect(worker).toContain('[triggers]');
    expect(worker).not.toContain('[assets]');
    expect(existsSync(resolve(repoRoot, 'wrangler.toml'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'wrangler.api.toml'))).toBe(false);
  });

  it('applies browser security headers to Pages assets', () => {
    const headers = read('public/_headers');

    expect(headers).toContain("Content-Security-Policy: default-src 'self'");
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('/control-room/*');
    expect(headers).toContain('Cache-Control: no-store');
  });
});
