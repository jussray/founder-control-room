#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const skill = readFileSync(new URL('../skills/urlfix/SKILL.md', import.meta.url), 'utf8');
const schema = JSON.parse(readFileSync(new URL('../config/urlfix.schema.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/lib/urlfix.ts', import.meta.url), 'utf8');
const proof = readFileSync(new URL('../e2e/urlfix-proof.ts', import.meta.url), 'utf8');

const checks = [
  ['candidate version is 0.2.0', /version:\s*0\.2\.0/.test(skill) && /status:\s*candidate/.test(skill)],
  ['FCR registry is authoritative', /existing FCR active portfolio registry/.test(skill) && /Do not create a parallel project registry/.test(skill)],
  ['goalfix owns source repair', /Goalfix owns source-repair discipline/.test(skill)],
  ['failure-plane contract exists', /CDN_EDGE/.test(skill) && /THIRD_PARTY_PROVIDER/.test(skill) && source.includes('URLFIX_FAILURE_PLANES')],
  ['proof state machine is explicit', /LIVE_BROWSER_PROVEN/.test(skill) && source.includes('URLFIX_STATES')],
  ['mock evidence cannot establish live proof', /may never prove production API behavior/.test(skill) && source.includes("receipt.after.evidenceMode !== 'REAL'" )],
  ['runtime identity is separate from source repair authority', /runtime identity remains unknown/.test(skill) && source.includes('runtimeIdentityKnown')],
  ['witness spec fingerprint is stable while run ids differ', /different run IDs/.test(skill) && source.includes('createUrlFixWitnessFingerprint')],
  ['carrier reuse is bounded', /BLOCKED_CARRIER_SCOPE/.test(skill) && /same root cause or repair objective/.test(skill)],
  ['consequential effects remain separately authorized', /Stop before account creation, payments, subscriptions/.test(skill)],
  ['evidence hygiene forbids secrets', /Authorization headers/.test(skill) && /access\/refresh tokens/.test(skill)],
  ['schema id/version matches', schema.$id === 'https://foundercontrolroom.org/schemas/urlfix-v0.2.0.json' && schema.properties?.schema?.const === 'juss/urlfix@v0.2.0'],
  ['schema includes required evidence modes', schema.$defs?.evidenceMode?.enum?.includes('REAL') && schema.$defs?.evidenceMode?.enum?.includes('MOCKED')],
  ['schema includes live proof state', schema.$defs?.state?.enum?.includes('LIVE_BROWSER_PROVEN')],
  ['playwright proof exercises before and after witness', proof.includes('beforeRun') && proof.includes('afterRun') && proof.includes('createUrlFixWitnessFingerprint')],
];

const failures = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'FAIL'} - ${name}`);

if (failures.length > 0) {
  console.error(`URLFix contract verification failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}

console.log(`URLFix contract verified: ${checks.length}/${checks.length}`);
