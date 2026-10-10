#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { evaluateUrlFixMergeReviewHandoff } from './urlfix-merge-review-contract.mjs';

const skill = readFileSync(new URL('../skills/urlfix/SKILL.md', import.meta.url), 'utf8');
const mergeAnnex = readFileSync(new URL('../skills/urlfix/MERGE_REVIEW.md', import.meta.url), 'utf8');
const schema = JSON.parse(readFileSync(new URL('../config/urlfix.schema.json', import.meta.url), 'utf8'));
const mergeSchema = JSON.parse(readFileSync(new URL('../config/urlfix-merge-review.schema.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/lib/urlfix.ts', import.meta.url), 'utf8');
const proof = readFileSync(new URL('../e2e/urlfix-proof.ts', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../src/lib/__tests__/urlfix.test.ts', import.meta.url), 'utf8');
const aiAdapter = readFileSync(new URL('../.ai/skills/urlfix/SKILL.md', import.meta.url), 'utf8');
const claudeAdapter = readFileSync(new URL('../.claude/skills/urlfix/SKILL.md', import.meta.url), 'utf8');
const reviewMergeSkill = readFileSync(new URL('../.claude/skills/review-verify-merge/SKILL.md', import.meta.url), 'utf8');

const issueSchemaText = JSON.stringify(schema.$defs?.issue?.allOf || []);

const validMergePacket = {
  schema: 'juss/urlfix-merge-review@v1',
  repository: 'jussray/founder-control-room',
  pullRequest: 999,
  base: { ref: 'main', sha: 'a'.repeat(40) },
  head: { ref: 'fix/urlfix-proof', sha: 'b'.repeat(40) },
  repair: { issueIds: ['URLFIX-001'], carrier: 'PR #999' },
  proof: {
    highestState: 'LIVE_BROWSER_PROVEN',
    exactHeadSha: 'b'.repeat(40),
    proofRefs: ['urlfix:receipt:001'],
    residualRisk: [],
  },
  handoff: {
    intent: 'REVIEW_ONLY',
    reviewSkill: 'review-verify-merge',
    mergeAuthorized: false,
  },
  issuedAt: '2026-10-02T00:00:00.000Z',
  expiresOnRefMovement: true,
};

const validMergeDecision = evaluateUrlFixMergeReviewHandoff(validMergePacket);
const forgedMergeAuthorityDecision = evaluateUrlFixMergeReviewHandoff({
  ...validMergePacket,
  handoff: { ...validMergePacket.handoff, mergeAuthorized: true },
});
const staleProofHeadDecision = evaluateUrlFixMergeReviewHandoff({
  ...validMergePacket,
  proof: { ...validMergePacket.proof, exactHeadSha: 'c'.repeat(40) },
});
const noPrDecision = evaluateUrlFixMergeReviewHandoff({
  ...validMergePacket,
  pullRequest: null,
});

const checks = [
  ['candidate version is 0.2.0', /version:\s*0\.2\.0/.test(skill) && /status:\s*candidate/.test(skill)],
  ['existing FCR registry remains authority', /existing FCR active portfolio registry/.test(skill) && /Do not create a parallel project registry/.test(skill)],
  ['goalfix owns source repair', /Goalfix owns source-repair discipline/.test(skill)],
  ['failure-plane contract exists', /CDN_EDGE/.test(skill) && /THIRD_PARTY_PROVIDER/.test(skill) && source.includes('URLFIX_FAILURE_PLANES')],
  ['behavioral fingerprint excludes environment mode', !source.match(/createUrlFixWitnessFingerprint[\s\S]{0,900}dependencyMode/)],
  ['behavioral fingerprint binds Chromium', source.includes('browser: spec.browser') && /Playwright browser family: `chromium`/.test(skill)],
  ['full route includes query and fragment', source.includes('`${url.pathname}${url.search}${url.hash}`') && /pathname \+ query \+ fragment/.test(skill)],
  ['every run is checked against the witness route', source.includes('validateRunBehaviorTarget(receipt.before') && source.includes('validateRunBehaviorTarget(receipt.after')],
  ['live proof requires live before and after', source.includes("receipt.before.target !== 'LIVE'") && /real live before execution/.test(skill)],
  ['live proof requires same origin', source.includes('beforeUrl.origin !== afterUrl.origin') && /same live origin and full browser route/.test(skill)],
  ['preview proof requires verified runtime identity', source.includes('preview browser proof requires an independently verified preview runtime identity')],
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
  ['schema binds browser to Chromium', schema.$defs?.witnessSpec?.properties?.browser?.const === 'chromium' && schema.$defs?.witnessSpec?.required?.includes('browser')],
  ['schema browser states require verification', issueSchemaText.includes('LOCAL_BROWSER_PROVEN') && issueSchemaText.includes('PREVIEW_BROWSER_PROVEN') && issueSchemaText.includes('LIVE_BROWSER_PROVEN') && issueSchemaText.includes('verification')],
  ['schema preview state requires real runtime receipt', issueSchemaText.includes('PREVIEW_BROWSER_PROVEN') && issueSchemaText.includes('PREVIEW') && issueSchemaText.includes('runtimeEvidenceRef')],
  ['schema live before and after require runtime receipts', (issueSchemaText.match(/runtimeEvidenceRef/g) || []).length >= 3],
  ['adversarial tests cover forged authority', tests.includes('rejects forged ownership or repair-authority strings')],
  ['adversarial tests cover trust-fact recombination', tests.includes('recombining a true origin fact') && tests.includes('repair receipt that belongs to a different project')],
  ['adversarial tests cover stale runtime receipt reuse', tests.includes('reused for a different runtime identity')],
  ['adversarial tests cover cross-origin false proof', tests.includes('different live origin')],
  ['adversarial tests cover query-state laundering', tests.includes('different query state')],
  ['adversarial tests cover untrusted preview runtime', tests.includes('without bound runtime evidence')],
  ['AI adapter routes to canonical contract', /Canonical contract: `skills\/urlfix\/SKILL\.md`/.test(aiAdapter)],
  ['Claude adapter routes to canonical contract', /Canonical contract: `skills\/urlfix\/SKILL\.md`/.test(claudeAdapter)],
  ['merge-review annex is mandatory from adapters', aiAdapter.includes('skills/urlfix/MERGE_REVIEW.md') && claudeAdapter.includes('skills/urlfix/MERGE_REVIEW.md')],
  ['canonical skill delegates merge review instead of claiming authority', skill.includes('review-verify-merge') && skill.includes('mergeAuthorized: false') && /browser proof itself are not merge approval/.test(skill)],
  ['merge handoff schema is review-only and non-authorizing', mergeSchema.$id === 'https://foundercontrolroom.org/schemas/urlfix-merge-review-v1.json' && mergeSchema.properties?.handoff?.properties?.intent?.const === 'REVIEW_ONLY' && mergeSchema.properties?.handoff?.properties?.mergeAuthorized?.const === false],
  ['valid exact-head merge-review packet is accepted', validMergeDecision.reviewHandoffReady === true && validMergeDecision.mergeAuthorized === false],
  ['URLFix cannot forge merge authority', forgedMergeAuthorityDecision.reviewHandoffReady === false && forgedMergeAuthorityDecision.mergeAuthorized === false && forgedMergeAuthorityDecision.errors.join(' ').includes('never grant merge authority')],
  ['proof head mismatch blocks merge review', staleProofHeadDecision.reviewHandoffReady === false && staleProofHeadDecision.errors.join(' ').includes('does not match')],
  ['merge review requires an existing PR', noPrDecision.reviewHandoffReady === false && noPrDecision.errors.join(' ').includes('pull request number')],
  ['base/head movement explicitly expires URLFix handoff', /expires the packet/.test(mergeAnnex) && /base\/head movement/.test(skill)],
  ['merge review does not inherit stale approval', /do not carry prior approval forward/.test(mergeAnnex)],
  ['existing review skill reacquires repo truth and exact-head gates', reviewMergeSkill.includes('Invoke `/repo-truth`') && reviewMergeSkill.includes('exact head') && reviewMergeSkill.includes('browser evidence exists when required')],
  ['existing review skill keeps merge separate from deploy proof', reviewMergeSkill.includes('Verify deployment separately if production state is part of the goal')],
];

const failures = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'ok' : 'FAIL'} - ${name}`);

if (failures.length > 0) {
  console.error(`URLFix contract verification failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}

console.log(`URLFix contract verified: ${checks.length}/${checks.length}`);
