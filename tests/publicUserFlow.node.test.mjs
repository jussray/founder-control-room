import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(new URL(path, 'file://' + root.replace(/\/$/, '') + '/'), 'utf8');

test('customer entry is visible from the public homepage, not the founder sign-in', () => {
  const home = read('public/index.html');
  assert.match(home, /href="\/account\/"[^>]*>[^<]*?(?:Get started|Create your workspace|Customer access)/i);
  assert.match(home, /No account is required to explore the public FCR world/i);
  assert.match(home, /href="\/control-room\/" aria-label="Founder sign-in"/);
});

test('customer onboarding never claims unverified signup, billing or private access', () => {
  const page = read('public/account/index.html');
  for (const term of ['Explore', 'Choose', 'Account', 'Workspace', 'not yet available', 'No payment is collected']) {
    assert.ok(page.includes(term), 'missing onboarding truth: ' + term);
  }
  assert.match(page, /href="\/work\.html"/);
  assert.doesNotMatch(page, /<form\b|<input\b|<script\b|data:[^" ]+|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(page, /founder-only|founder access/i);
  assert.match(page, /disabled[^>]*aria-disabled="true"|aria-disabled="true"[^>]*disabled/i);
});

test('customer static route stays on Pages, never proxies to the privileged API', () => {
  const worker = read('public/_worker.js');
  assert.match(worker, /STATIC_DIRECTORY_PREFIXES\s*=\s*\[[\s\S]*?'\/account'/);
  const headers = read('public/_headers');
  assert.match(headers, /\/account\/\*[\s\S]*?Cache-Control: no-store/);
});
