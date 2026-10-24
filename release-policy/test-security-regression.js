#!/usr/bin/env node
/**
 * Security regression tests for portfolio release.
 *
 * Validates that the release tuple does not reintroduce known security issues:
 * - StoryEngine tenant isolation (PR #131)
 * - StoryEngine studio guard hardening (PR #130)
 * - Sekret-Bip data privacy boundaries
 * - Chief AI governance policy enforcement
 *
 * This source-only diagnostic must fail closed until executable security suites are wired.
 */

const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../releases/portfolio-v0.1.0.json'), 'utf8'));
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, './repositories.json'), 'utf8'));

console.log('Security Regression Tests');
console.log('========================');
console.log('');
console.log('Release tuple:');
console.log(`  StoryEngine:  ${manifest.repositories.storyengine.commit}`);
console.log(`  Chief AI:     ${manifest.repositories.chiefAi.commit}`);
console.log(`  Sekret-Bip:   ${manifest.repositories.sekretBip.commit}`);
console.log('');

// Verify required recovery ancestors are present
const requiredAncestors = policy.requiredRecoveryAncestors.storyengine || [];
console.log(`Security work (recovered from ${requiredAncestors.length} commits):`);
for (const ancestor of requiredAncestors) {
  console.log(`  ✓ ${ancestor} (declared only; independently verify pinned ancestry)`);
}
console.log('');

const regressions = [
  {
    name: 'StoryEngine tenant isolation',
    ancestors: ['7dbfecd'],
    status: 'UNVERIFIED',
    reason: 'Requires exact pinned ancestry and passing tenant isolation tests',
  },
  {
    name: 'StoryEngine studio guard hardening',
    ancestors: ['645d929'],
    status: 'UNVERIFIED',
    reason: 'Requires exact pinned ancestry and passing studio authorization tests',
  },
  {
    name: 'Sekret-Bip teen safety boundaries',
    ancestors: [],
    status: 'UNVERIFIED',
    reason: 'Requires executed Se'kret Bip privacy and safety tests',
  },
  {
    name: 'Chief AI governance enforcement',
    ancestors: [],
    status: 'UNVERIFIED',
    reason: 'Requires executed Chief governance and authority tests',
  },
];

console.log('Test Results:');
let verified = 0;
for (const test of regressions) {
  const symbol = test.status === 'VERIFIED' ? '✓' : '⏳';
  console.log(`  ${symbol} ${test.name}: ${test.status}`);
  console.log(`     ${test.reason}`);
  if (test.status === 'VERIFIED') verified++;
}

console.log('');

if (verified === regressions.length) {
  console.log('✓ Security regression tests verified.');
  console.log('');
  console.log('Standalone checks alone do not prove a security release.');
  console.log('Known work recovered: 4 commits (tenant isolation, studio guard, styling, security fixes).');
  process.exit(0);
} else {
  console.log(`✗ ${regressions.length - verified} regression test(s) not verified.`);
  process.exit(1);
}
