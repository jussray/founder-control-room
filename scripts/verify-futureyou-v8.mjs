import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [contract, route, server, html, client, policy, docs, pkgText] = await Promise.all([
  read('src/futureyou/missionControl.ts'),
  read('src/http/routes/futureYou.ts'),
  read('src/http/server.ts'),
  read('public/control-room/futureyou-v8.html'),
  read('public/control-room/futureyou-v8.js'),
  read('src/lib/standingFounderPolicy.ts'),
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
requireValue(client.includes("api('/plugin-center')"), 'FutureYou client does not read project-scoped Plugin Center authority');
requireValue(client.includes('Declared autonomy readiness'), 'FutureYou client does not render autonomy readiness');
requireValue(client.includes('Credential values are never rendered here'), 'FutureYou client must state the credential rendering boundary');
requireValue(client.includes('It is not a revenue forecast'), 'FutureYou client must display the financial truth boundary');
requireValue(!client.includes('secretRef}</') && !client.includes('secretRef)}'), 'FutureYou client must not render secretRef values');

for (const marker of [
  "version: 'standing-founder-policy-v1'",
  "mode: 'autonomous'",
  "mode: 'proof-gated'",
  "mode: 'founder-required'",
  'selfExpansionAllowed: false',
  'may never expand its own authority',
]) {
  requireValue(policy.includes(marker), `standing founder policy missing ${JSON.stringify(marker)}`);
}

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
console.log('The cockpit remains founder-gated and read-only while surfacing project-scoped declared autonomy readiness.');
console.log('Standing policy keeps reversible L1-L4 work autonomous, L5-L6 proof-gated, and authority expansion founder-controlled.');
console.log('Runtime behavior still requires tests and rendered browser evidence.');