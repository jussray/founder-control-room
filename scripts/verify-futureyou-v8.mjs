import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [contract, route, server, html, client, docs, pkgText] = await Promise.all([
  read('src/futureyou/missionControl.ts'),
  read('src/http/routes/futureYou.ts'),
  read('src/http/server.ts'),
  read('public/control-room/futureyou-v8.html'),
  read('public/control-room/futureyou-v8.js'),
  read('docs/FUTUREYOU_V8_MISSION_CONTROL.md'),
  read('package.json'),
]);

const pkg = JSON.parse(pkgText);
const failures = [];
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const marker of ['futureyou-v8', 'No verified revenue or expected-value feed', 'requiresExplicitApproval', 'lindyMode', 'L99']) {
  requireValue(contract.includes(marker), `mission-control contract missing ${JSON.stringify(marker)}`);
}

requireValue(route.includes("futureYouRouter.use(requireFounder)"), 'FutureYou route must remain founder-gated');
requireValue(route.includes("futureYouRouter.get('/v8/brief'"), 'FutureYou V8 brief route is missing');
requireValue(!route.includes('.insert(') && !route.includes('.update(') && !route.includes('.delete('), 'FutureYou route must remain read-only');
requireValue(server.includes("app.use('/futureyou', futureYouRouter)"), 'FutureYou router is not mounted');
requireValue(html.includes('FutureYou V8') && html.includes('futureyou-v8.js'), 'FutureYou V8 cockpit entry is incomplete');
requireValue(client.includes("api('/futureyou/v8/brief')"), 'FutureYou client does not read the governed brief');
requireValue(client.includes('It is not a revenue forecast'), 'FutureYou client must display the financial truth boundary');

for (const marker of ['FutureYou', 'Red Team', 'OODA', 'Lindy Mode', 'L99', 'A priority is not an approval']) {
  requireValue(docs.includes(marker), `FutureYou V8 documentation missing ${JSON.stringify(marker)}`);
}

requireValue(
  pkg.scripts?.['verify:futureyou-v8']?.includes('verify-futureyou-v8.mjs'),
  'package.json must expose verify:futureyou-v8',
);

if (failures.length > 0) {
  console.error('FutureYou V8 verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('FutureYou V8 static contract passed.');
console.log('The brief remains founder-gated, read-only, evidence-aware, and non-financial until verified revenue data exists.');
console.log('Runtime behavior still requires tests and rendered browser evidence.');
