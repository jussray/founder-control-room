import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const client = read('mobile/src/client.ts');
const screen = read('mobile/app/index.tsx');
const founderMiddleware = read('src/http/middleware/requireFounder.ts');
const dashboardRoute = read('src/http/routes/dashboard.ts');
const appConfig = JSON.parse(read('mobile/app.json'));
const pkg = JSON.parse(read('mobile/package.json'));

test('mobile founder session uses secure native storage and existing bearer identity gate', () => {
  assert.match(client, /expo-secure-store/);
  assert.doesNotMatch(client, /AsyncStorage|@react-native-async-storage/);
  assert.match(client, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(founderMiddleware, /const explicitBearer = bearerToken\(req\)/);
  assert.match(founderMiddleware, /founderAllowlisted\(identity\)/);
  assert.match(founderMiddleware, /export async function requireInteractiveFounder/);
});

test('mobile API surface is read-only and reuses existing dashboard reads', () => {
  assert.match(client, /method: 'GET'/);
  assert.match(client, /'\/dashboard\/tasks'/);
  assert.match(client, /'\/dashboard\/activity'/);
  assert.match(client, /'\/dashboard\/costs'/);
  assert.match(client, /`\/dashboard\/proof-engine\?projectSlug=\$\{slug\}`/);
  assert.doesNotMatch(client, /manual-analysis|\/approvals/i);
  assert.doesNotMatch(client, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);

  assert.match(dashboardRoute, /dashboardRouter\.get\('\/tasks'/);
  assert.match(dashboardRoute, /dashboardRouter\.get\('\/activity'/);
  assert.match(dashboardRoute, /dashboardRouter\.get\('\/proof-engine'/);
  assert.match(dashboardRoute, /dashboardRouter\.get\('\/costs'/);
});

test('native screen adds device utility without manufacturing interactive authority', () => {
  assert.match(screen, /expo-haptics/);
  assert.match(screen, /RefreshControl/);
  assert.match(screen, /Share\.share/);
  assert.match(screen, /Mobile v1 is read-only/);
  assert.match(screen, /High-consequence decisions remain behind FCR's interactive founder capability/);
  assert.doesNotMatch(screen, /WebView|react-native-webview/i);
});

test('store identity is explicit without provider credentials', () => {
  assert.equal(appConfig.expo.ios.bundleIdentifier, 'com.jussray.foundercontrolroom');
  assert.equal(appConfig.expo.android.package, 'com.jussray.foundercontrolroom');
  assert.equal(appConfig.expo.updates.enabled, false);
  assert.match(pkg.dependencies.expo, /^\^56\./);
  assert.ok(pkg.dependencies['expo-secure-store']);

  const serialized = `${JSON.stringify(appConfig)}\n${JSON.stringify(pkg)}`;
  assert.doesNotMatch(serialized, /appleId|ascAppId|appleTeamId|serviceAccountKey|api[_-]?key|secret/i);
});
