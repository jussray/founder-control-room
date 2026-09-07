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

  it('provides one public threshold into the founder-authenticated app', () => {
    const landing = read('public/index.html');
    const app = read('public/control-room/index.html');
    const bootstrap = read('public/control-room/opaque-session-bootstrap.js');
    const entryFlow = read('public/control-room/entry-flow.js');

    expect(landing).toContain('<link rel="canonical" href="https://www.foundercontrolroom.org/" />');
    expect(landing).toContain('Move one thing forward.');
    expect(landing).toContain('Turn an intention into an action you can prove.');
    expect(landing).toContain('href="/control-room/"');
    expect(landing.match(/Enter Control Room/g)?.length).toBe(1);
    expect(landing).not.toContain('data-bottom-nav="five-screen"');
    expect(landing).not.toContain('data-public-screen=');
    expect(landing).not.toContain('Meet Chief');
    expect(landing).not.toContain('PromptOS is an intention compiler.');

    expect(app).toContain('src="/control-room/opaque-session-bootstrap.js"');
    expect(app).toContain('src="/control-room/stack-router.js"');
    expect(app).toContain('src="/control-room/entry-flow.js"');
    expect(app).not.toContain('src="/control-room/app.js"');
    expect(app).not.toContain('launch-dock');

    expect(entryFlow).toContain("heading.textContent = 'Who are you?'");
    expect(entryFlow).toContain("appendText(copy, 'h1', '', 'What do you want to move?')");
    expect(entryFlow).toContain("fetch('/founder-os/preview'");
    expect(entryFlow).toContain("action: 'plan'");
    expect(entryFlow).toContain('Capability selection is the next handoff');

    expect(bootstrap).toContain("await import('/control-room/app.js')");
    expect(bootstrap).toContain("fetch('/auth/me'");
    expect(bootstrap).toContain("credentials: 'same-origin'");
    expect(bootstrap).toContain("sessionStorage.removeItem(LEGACY_SESSION_KEY)");
    expect(bootstrap).not.toMatch(/sessionStorage\.setItem\([^\n]*(?:access_token|refresh_token)/i);
    expect(bootstrap).not.toMatch(/JSON\.stringify\([^\n]*(?:access_token|refresh_token)/i);
    expect(existsSync(resolve(repoRoot, 'public/portable-founder-console/index.html'))).toBe(true);
  });

  it('keeps founder stack routing behind the authenticated shell', () => {
    const app = read('public/control-room/index.html');
    const stackRouter = read('public/control-room/stack-router.js');
    const entryFlow = read('public/control-room/entry-flow.js');

    expect(app).not.toContain('Every output fuels the next prompt');
    expect(app).not.toContain('data-lane="chat"');
    expect(app).not.toContain('data-lane="workflows"');
    expect(app).not.toContain('data-lane="code"');
    expect(app).not.toContain('data-lane="projects"');
    expect(app).not.toContain('data-lane="skills"');
    expect(app).toContain('src="/control-room/stack-router.js"');
    expect(app).toContain('src="/control-room/entry-flow.js"');

    expect(stackRouter).toContain("const PENDING_TAB_KEY = 'fcr_pending_tab'");
    expect(stackRouter).toContain("'terminal'");
    expect(stackRouter).toContain('.tabs button[data-tab=');
    expect(stackRouter).toContain('new MutationObserver');
    expect(entryFlow).toContain("const shell = document.querySelector('.shell')");
    expect(entryFlow).toContain("const tabs = shell?.querySelector('.tabs')");
  });

  it('keeps the proof-bound founder content lifecycle available as an authenticated product surface', () => {
    const contentManager = read('public/control-room/content-manager.html');
    const playwrightProof = read('e2e/content-manager-proof.mjs');

    expect(contentManager).toContain('Workflow content lifecycle');
    expect(contentManager).not.toContain('Cowork');
    expect(contentManager).toContain('Proof → draft → review → approval → schedule → publish → metrics');
    expect(contentManager).toContain('First-party LinkedIn publish capability implemented');
    expect(contentManager).toContain('Temporal truth UNKNOWN until execution');
    expect(contentManager).toContain('Capability is not publication proof.');
    expect(contentManager).toContain('chief-ai/founder-content-proposal');
    expect(contentManager).toContain('exact Current You authorization');
    expect(contentManager).toContain('publish_founder_content');
    expect(contentManager).toContain('provider readback + outcome receipt');
    expect(contentManager).toContain('Publication requires terminal provider readback bound to the authorized execution.');
    expect(contentManager).not.toContain('create_linkedin_post');
    expect(contentManager).not.toContain('publish_now(confirmPublication: true)');
    expect(contentManager).not.toContain('remains review-window only');

    const approval = contentManager.indexOf('data-content-stage="approval"');
    const publish = contentManager.indexOf('data-content-stage="publish"');
    expect(approval).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(approval);

    expect(playwrightProof).toContain("viewport: { width: 390, height: 844 }");
    expect(playwrightProof).toContain("'content-manager-mobile.png'");
    expect(playwrightProof).toContain('page must not overflow the mobile viewport');
    expect(playwrightProof).toContain('capability must not be presented as an already-authorized publish control');
    expect(playwrightProof).toContain('approved post may expose publish gate without being authorized to execute it');
  });

  it('keeps browser API calls same-origin and binds them directly to the API Worker', () => {
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
    expect(proxy).toContain("typeof env.FCR_API.fetch !== 'function'");
    expect(proxy).toContain("API_SERVICE_BINDING_UNAVAILABLE");
    expect(proxy).toContain('const response = await env.FCR_API.fetch(createApiRequest(request))');
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
