import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Site bridge mounts in the actual FCR HTTP runtime', () => {
  const server = file('src/http/server.ts');
  assert.match(server, /import \{ commandCenterSiteRouter \} from '\.\/routes\/commandCenterSite\.js'/);
  assert.match(server, /app\.use\(commandCenterSiteRouter\)/);
});
test('bootstrap is opt-in and uses verified identity and public tenant tables only', () => {
  const route = file('src/http/routes/commandCenterSite.ts');
  assert.match(route, /FCR_COMMAND_CENTER_SITE_ENABLED !== 'true'/);
  assert.match(route, /resolveCommandCenterActor/);
  assert.match(route, /supabaseAuth\.auth\.getUser/);
  assert.match(route, /listMyPublicProjects/);
  assert.match(route, /'fcr_public_memberships'/);
  assert.match(route, /'fcr_public_projects'/);
  assert.doesNotMatch(route, /\.from\('projects'\)/);
  assert.match(route, /'Cache-Control': 'private, no-store'/);
});
test('founder-reported ChatGPT Site stays unverified', () => {
  const sites = file('SITES.md');
  assert.match(sites, /fcr-command-center\.jussray\.chatgpt\.site/);
  assert.match(sites, /site_identity_status: unverified/);
  assert.match(sites, /continuity_status: UNKNOWN/);
});
