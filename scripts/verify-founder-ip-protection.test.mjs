import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFounderIpRegistry } from './verify-founder-ip-protection.mjs';

const registry = JSON.parse(readFileSync(new URL('../config/founder-ip-protection-registry.json', import.meta.url), 'utf8'));

test('portfolio registry contains all six controls and all four standalone peers', () => {
  assert.deepEqual(validateFounderIpRegistry(registry), []);
});

test('empty integration inventory is explicitly incomplete, not proof of no integrations', () => {
  const candidate = structuredClone(registry);
  candidate.integration_inventory.status = 'complete';
  assert.ok(validateFounderIpRegistry(candidate).some((error) => error.includes('empty integration inventory')));
});

test('SolContinuity Apache-2.0 and contributor ownership uncertainty cannot be overwritten', () => {
  const candidate = structuredClone(registry);
  candidate.systems.find((system) => system.id === 'solcontinuity').license_posture = 'proprietary';
  assert.ok(validateFounderIpRegistry(candidate).some((error) => error.includes('SolContinuity Apache-2.0')));
});

test('confidential integration cannot be approved with unknown provider training or retention posture', () => {
  const candidate = structuredClone(registry);
  candidate.integration_inventory.known_integration_records.push({
    id: 'test-provider', provider: 'Example', product_or_plan: 'Test',
    data_classes: ['confidential'], terms_url: 'https://example.invalid/terms',
    terms_reviewed_at: 'unknown', training_status: 'unknown', retention_status: 'unknown',
    access_scope: 'test only', revocation_path: 'test revoke', evidence: [],
    approval_status: 'approved', status: 'active'
  });
  const errors = validateFounderIpRegistry(candidate);
  assert.ok(errors.some((error) => error.includes('cannot be approved')));
  assert.ok(errors.some((error) => error.includes('cannot be active')));
});

test('cross-product access requires a contract and technical access never grants ownership', () => {
  const candidate = structuredClone(registry);
  candidate.integration_inventory.known_integration_records.push({
    id: 'test-peer', provider: 'Example', product_or_plan: 'Test',
    data_classes: ['internal'], terms_url: 'https://example.invalid/terms',
    terms_reviewed_at: '2026-11-26', training_status: 'not_used',
    retention_status: 'documented', access_scope: 'read', revocation_path: 'revoke',
    evidence: ['test fixture'], status: 'active', cross_product_access: true,
    grants_ownership: true
  });
  const errors = validateFounderIpRegistry(candidate);
  assert.ok(errors.some((error) => error.includes('cross-product access requires contract_ref')));
  assert.ok(errors.some((error) => error.includes('cannot grant IP ownership')));
});
