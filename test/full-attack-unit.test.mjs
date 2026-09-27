import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTACK_UNIT_MEMBERS, runFullAttackUnit } from '../security/full-attack-unit.mjs';

function observation(overrides = {}) {
  return {
    verdict: 'HALLWAY',
    technicalIdentity: { actorFingerprint: 'fp', claimedCrawler: 'googlebot', verifiedBot: false },
    receipt: 'a'.repeat(64),
    hallway: { active: true, logicalExpansion: 48_123, lazyMaterialization: true, productionExposure: 0, realCustomerData: false, realCredentials: false, crossSessionSharing: false },
    boundaries: { ownedOrAuthorizedSurfacesOnly: true, externalCompromise: false, externalExploit: false, outboundRetaliation: false },
    ...overrides,
  };
}

test('every member executes and suspicious traffic resolves to containment', () => {
  const unit = runFullAttackUnit(observation());
  assert.equal(unit.mode, 'executed');
  assert.equal(unit.allMembersAccountedFor, true);
  assert.equal(unit.expectedCount, ATTACK_UNIT_MEMBERS.length);
  assert.equal(unit.executedCount, ATTACK_UNIT_MEMBERS.length);
  assert.ok(unit.results.every((item) => item.executed === true));
  assert.equal(unit.unitVerdict, 'CONTAIN_ONLY');
  assert.equal(unit.results.find((item) => item.flow === 'truthmode')?.status, 'CLAIMED');
  assert.equal(unit.results.find((item) => item.flow === 'attack-3000')?.status, 'CHALLENGE');
});

test('production isolation tamper forces Attack 48000, L99, Goalfix and ULTRATHINK to fail closed', () => {
  const unit = runFullAttackUnit(observation({ hallway: { ...observation().hallway, productionExposure: 1 } }));
  assert.equal(unit.unitVerdict, 'REPAIR_REQUIRED');
  assert.equal(unit.results.find((item) => item.flow === 'attack-48000')?.status, 'BLOCK');
  assert.equal(unit.results.find((item) => item.flow === 'l99')?.status, 'BLOCK');
  assert.equal(unit.results.find((item) => item.flow === 'goalfix')?.status, 'REPAIR_REQUIRED');
  assert.equal(unit.results.find((item) => item.flow === 'ultrathink')?.status, 'REPAIR_REQUIRED');
});
