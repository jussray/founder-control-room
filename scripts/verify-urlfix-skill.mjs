#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const skill = readFileSync(new URL('../skills/urlfix/SKILL.md', import.meta.url), 'utf8');
const schema = JSON.parse(readFileSync(new URL('../config/urlfix.schema.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/lib/urlfix.ts', import.meta.url), 'utf8');
const proof = readFileSync(new URL('../e2e/urlfix-proof.ts', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../src/lib/__tests__/urlfix.test.ts', import.meta.url), 'utf8');

const checks = [
  ['candidate version is 0.2.0', /version:\s*0\.2\.0/.test(skill) && /status:\s*candidate/.test(skill)],
  ['existing FCR registry remains authority', /existing FCR active portfolio registry/.test(skill) && /Do not create a parallel project registry/.test(skill)],
  ['goalfix owns source repair', /Goalfix owns source-repair discipline/.test(skill)],
  ['failure-plane contract exists', /CDN_EDGE/.test(skill) && /THIRD_PARTY_PROVIDER/.test(skill) && source.includes('URLFIX_FAILURE_PLANES')],
  ['behavioral fingerprint excludes environment mode', !source.match(/createUrlFixWitnessFingerprint[\s\S]{0,900}dependencyMode/)],
  ['live proof requires live before and after', source.includes("receipt.before.target !== 'LIVE'") && /real live before execution/.test(skill)],
  ['live proof requires same origin', source.includes('before.origin !== after.origin') && /same live origin and route/.test(skill)],
  ['artifact refs require independent trust', source.includes('verifiedArtifactIds') && /caller-supplied artifact ID/.test(skill)],
  ['runtime evidence requires independent trust', source.includes('verifiedRuntimeEvidenceRefs') && /runtime string is not proof/.test(skill)],
  ['source repair authority is FCR-verified', source.includes('verifiedRepairAuthorityReceiptRefs') && /payload cannot grant itself authority/.test(skill)],
  ['redirected final origin is authority checked', source.includes("final URL origin is outside") && /final origin must be inside/.test(skill)],
  ['mock evidence cannot establish live proof', /Fixture\/mocked\/intercepted evidence/.test(skill) && source.includes("receipt.after.evidenceMode !== 'REAL'" )],
  ['fixture proof labels itself fixture', proof.includes("evidenceMode: 'FIXTURE'")],
  ['carrier contamination is explicitly forbidden', /Do not create or contaminate a PR/.test(skill) && /BLOCKED_CARRIER_SCOPE/.test(skill)],
  ['public artifact leakage is forbidden', /Do not publish arbitrary screenshots/.test(skill)],
  ['schema id/version matches', schema.$id === 'https://foundercontrolroom.org/schemas/urlfix-v0.2.0.json' && schema.properties?.schema?.const === 'juss/urlfix@v0.2.0'],
  ['schema live state requires verification', JSON.stringify(schema.$defs?.issue?.allOf || []).includes('LIVE_BROWSER_PROVEN') && JSON.stringify(schema.$defs?.issue?.allOf || []).includes('verification')],
  ['adversarial tests cover forged authority', tests.includes('rejects forged ownership or repair-authority strings')],
  ['adversarial tests cover cross-origin false proof', tests.includes('different live origin')],
];

const failures = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'FAIL'} - ${name}`);

if (failures.length > 0) {
  console.error(`URLFix contract verification failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}

console.log(`URLFix contract verified: ${checks.length}/${checks.length}`);
