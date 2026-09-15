import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/fcr-access-front-door-recovery.yml', 'utf8');
const browserProof = readFileSync('scripts/verify-fcr-front-door-playwright.mjs', 'utf8');
const authRoute = readFileSync('src/http/routes/auth.ts', 'utf8');

test('stranger proof tests reachability and founder containment rather than public membership', () => {
  assert.match(browserProof, /audience:\s*'random-stranger'/);
  assert.match(browserProof, /https:\/\/foundercontrolroom\.org/);
  assert.match(browserProof, /https:\/\/www\.foundercontrolroom\.org/);
  assert.match(browserProof, /CONTROL_ROOM_URL/);
  assert.match(browserProof, /\.sign-in-wrap/);
  assert.match(browserProof, /\.shell/);
  assert.match(browserProof, /AUTH_ME_URL/);
  assert.match(browserProof, /receipt\.authMeStatus !== 401/);
  assert.match(browserProof, /founderAuthorityContained/);
  assert.match(browserProof, /chromium\.launch/);
  assert.doesNotMatch(browserProof, /signup/i);
});

test('founder auth contract remains allowlist-first and founder-gated', () => {
  const magicLinkBlock = authRoute.match(
    /authRouter\.post\('\/magic-link'([\s\S]*?)authRouter\.get\('\/callback'/,
  )?.[1] ?? '';
  assert.match(magicLinkBlock, /if \(await isAllowlisted\(email\)\)/);
  assert.match(magicLinkBlock, /signInWithOtp/);
  assert.ok(
    magicLinkBlock.indexOf('if (await isAllowlisted(email))')
      < magicLinkBlock.indexOf('signInWithOtp'),
    'allowlist check must precede Supabase magic-link creation',
  );
  assert.match(authRoute, /authRouter\.get\('\/me', requireFounder/);
  assert.match(authRoute, /if \(!\(await isAllowlisted\(email\)\)\) return respondError\(res, 403, 'FORBIDDEN'/);
  assert.doesNotMatch(authRoute, /authRouter\.(?:post|get)\('\/signup'/);
});

test('provider and stranger witnesses are independent and aggregate fail closed', () => {
  const inspectBlock = workflow.match(
    /- name: Inspect live Access state without mutation([\s\S]*?)- name: Apply exact public destination/,
  )?.[1] ?? '';
  const browserBlock = workflow.match(
    /- name: Verify stranger reachability and founder containment with Playwright([\s\S]*?)- name: Roll back/,
  )?.[1] ?? '';
  const gateBlock = workflow.match(
    /- name: Evaluate independent provider and stranger evidence([\s\S]*?)- name: Return sanitized recovery receipt/,
  )?.[1] ?? '';

  assert.match(inspectBlock, /id:\s*access_inspect/);
  assert.match(inspectBlock, /continue-on-error:\s*true/);
  assert.match(browserBlock, /id:\s*stranger_browser/);
  assert.match(browserBlock, /if: always\(\) && steps\.contracts\.outcome == 'success' && steps\.chromium\.outcome == 'success'/);
  assert.doesNotMatch(browserBlock, /access_inspect|access_apply/);
  assert.match(gateBlock, /provider_outcome/);
  assert.match(gateBlock, /STRANGER_BROWSER_OUTCOME/);
  assert.match(gateBlock, /test "\$provider_outcome" = 'success'/);
  assert.match(gateBlock, /test "\$STRANGER_BROWSER_OUTCOME" = 'success'/);
  assert.match(workflow, /Fail closed after retaining independent provider and stranger evidence/);
});

test('sanitized stranger receipt publishes only bounded containment evidence', () => {
  assert.match(workflow, /\.scope == "fcr-access-front-door-browser-proof"/);
  assert.match(workflow, /\.audience == "random-stranger"/);
  assert.match(workflow, /\.founderSignInVisible \| type == "boolean"/);
  assert.match(workflow, /\.founderShellVisible \| type == "boolean"/);
  assert.match(workflow, /\.authMeStatus \| status_or_null/);
  assert.match(workflow, /\.founderAuthorityContained \| type == "boolean"/);
  assert.match(workflow, /Browser proof receipt/);
  assert.doesNotMatch(workflow, /\n\s*error,\s*\n/);
  assert.doesNotMatch(workflow, /cat "\$browser_receipt"/);
});
