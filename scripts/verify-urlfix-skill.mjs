#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const skill = readFileSync(new URL('../skills/urlfix/SKILL.md', import.meta.url), 'utf8');
const schema = JSON.parse(readFileSync(new URL('../config/urlfix.schema.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/lib/urlfix.ts', import.meta.url), 'utf8');
const proof = readFileSync(new URL('../e2e/urlfix-proof.ts', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../src/lib/__tests__/urlfix.test.ts', import.meta.url), 'utf8');
const aiAdapter = readFileSync(new URL('../.ai/skills/urlfix/SKILL.md', import.meta.url), 'utf8');
const claudeAdapter = readFileSync(new URL('../.claude/skills/urlfix/SKILL.md', import.meta.url), 'utf8');

const checks = [
  ['candidate version is 0.2.0', /version:\s*0\.2\.0/.test(skill) && /status:\s*candidate/.test(skill)],
  ['existing FCR registry remains authority', /existing FCR active portfolio registry/.test(skill) && /Do not create a parallel project registry/.test(skill)],
  ['goalfix owns source repair', /Goalfix owns source-repair discipline/.test(skill)],
  ['failure-plane contract exists', /CDN_EDGE/.test(skill) && /THIRD_PARTY_PROVIDER/.test(skill) && source.includes('URLFIX_FAILURE_PLANES')],
  ['behavioral fingerprint excludes environment mode', !source.match(/createUrlFixWitnessFingerprint[\s\S]{0,900}dependencyMode/)],
  ['live proof requires live before and after', source.includes("receipt.before.target !== 'LIVE'") && /real live before execution/.test(skill)],
  ['live proof requires same origin', source.includes('before.origin !== after.origin') && /same live origin and route/.test(skill)],
  ['artifact trust binds id to hash', source.includes('verifiedArtifacts') && source.includes('trustedHash.toLowerCase() === ref.sha256.toLowerCase()')],
  ['runtime evidence binds ref identity and origin', source.includes('verifiedRuntimeEvidence') && source.includes('trusted.runtimeIdentity === run.runtimeIdentity') && source.includes('trusted.origin === origin')],
  ['ownership evidence is tuple-bound', source.includes('verifiedUrlBindings') && /origin \+ project slug \+ canonical repository/.test(skill)],
  ['repair authority is project-bound', source.includes('verifiedRepairAuthorities') && /repair receipt \+ project slug \+ canonical repository/.test(skill)],
  ['redirected final origin is authority checked', source.includes('final URL origin is not tuple-bound') && /final origins must have FCR evidence/.test(skill)],
  ['mock evidence cannot establish live proof', /Fixture\/mocked\/intercepted evidence/.test(skill) && source.includes("receipt.after.evidenceMode !== 'REAL'" )],
  ['fixture proof labels itself fixture', proof.includes("evidenceMode: 'FIXTURE'")],
  ['carrier contamination is explicitly forbidden', /Do not create or contaminate a PR/.test(skill) && /BLOCKED_CARRIER_SCOPE/.test(skill)],
  ['public artifact leakage is forbidden', /Do not publish arbitrary screenshots/.test(skill)],
  ['schema id/version matches', schema.$id === 'https://foundercontrolroom.org/schemas/urlfix-v0.2.0.json' && schema.properties?.schema?.const === 'juss/urlfix@v0.2.0'],
  ['schema live state requires verification', JSON.stringify(schema.$defs?.issue?.allOf || []).includes('LIVE_BROWSER_PROVEN') && JSON.stringify(schema.$defs?.issue?.allOf || []).includes('verification')],
  ['schema live before and after require runtime receipts', (JSON.stringify(schema.$defs?.issue?.allOf || []).match(/runtimeEvidenceRef/g) || []).length >= 2],
  ['adversarial tests cover forged authority', tests.includes('rejects forged ownership or repair-authority strings')],
  ['adversarial tests cover trust-fact recombination', tests.includes('recombining a true origin fact') && tests.includes('repair receipt that belongs to a different project')],
  ['adversarial tests cover stale runtime receipt reuse', tests.includes('reused for a different runtime identity')],
  ['adversarial tests cover cross-origin false proof', tests.includes('different live origin')],
  ['AI adapter routes to canonical contract', /Canonical contract: `skills\/urlfix\/SKILL\.md`/.test(aiAdapter)],
  ['Claude adapter routes to canonical contract', /Canonical contract: `skills\/urlfix\/SKILL\.md`/.test(claudeAdapter)],
];

const failures = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'FAIL'} - ${name}`);

if (failures.length > 0) {
  console.error(`URLFix contract verification failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}

console.log(`URLFix contract verified: ${checks.length}/${checks.length}`);
