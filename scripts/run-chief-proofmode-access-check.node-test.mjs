import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHIEF_ACCESS_FAILURE_CLASSIFICATIONS,
  buildChiefAccessFailureReceipt,
  classifyChiefAccessFailure,
  normalizeSafeChiefTarget,
} from './run-chief-proofmode-access-check.mjs';

const TARGET = 'https://624e00c7-chief-ai.mcgill-raylene.workers.dev';

const cases = [
  ['CLOUDFLARE_ACCESS_API_TOKEN is required.', 'missing_read_credential'],
  ['Cloudflare API request failed with HTTP 403 (code 9109).', 'provider_read_failed'],
  ['Cloudflare API returned non-JSON HTTP 502.', 'provider_read_shape_invalid'],
  ['List Access applications returned an unexpected result shape.', 'provider_read_shape_invalid'],
  ['Multiple public Access applications match the Chief preview paths; refusing ambiguous precedence.', 'ambiguous_application'],
  ['No existing non-identity service-token binding identifies the Chief CI token; configure an exact protected selector before repair.', 'no_bound_service_token'],
  ['Multiple service-token identities are bound to the effective Chief Access application; found 2; refusing ambiguous discovery.', 'ambiguous_bound_service_token'],
  ['Configured Chief service-token ID does not match the configured client ID.', 'configured_service_token_mismatch'],
  ['The configured Chief Access service token is disabled.', 'service_token_disabled'],
  ['The configured Chief Access service token is expired.', 'service_token_expired_or_invalid'],
  ['The configured Chief Access service token has invalid expiry metadata.', 'service_token_expired_or_invalid'],
  ['A ProofMode CI service-auth policy exists for another rule; refusing automatic overwrite.', 'policy_conflict'],
  ['No matching Chief Service Auth policy exists on effective scope preview_worker.', 'policy_missing'],
];

test('maps known fail-closed errors to a fixed diagnostic allowlist', () => {
  for (const [message, expected] of cases) {
    assert.equal(classifyChiefAccessFailure(new Error(message)), expected);
    assert.equal(CHIEF_ACCESS_FAILURE_CLASSIFICATIONS.includes(expected), true);
  }
  assert.equal(classifyChiefAccessFailure(new Error('unrecognized provider condition')), 'provider_check_failed');
});

test('failure receipt contains only bounded fields and never the raw error', () => {
  const raw = 'Cloudflare API request failed with HTTP 403 SECRET_DO_NOT_PUBLISH';
  const receipt = buildChiefAccessFailureReceipt({
    error: new Error(raw),
    targetUrl: TARGET,
    observedAt: '2026-09-06T19:30:00.000Z',
  });
  assert.deepEqual(Object.keys(receipt).sort(), [
    'classification',
    'mode',
    'mutationPerformed',
    'observedAt',
    'schemaVersion',
    'scope',
    'state',
    'targetOrigin',
  ].sort());
  assert.equal(receipt.classification, 'provider_read_failed');
  assert.equal(receipt.state, 'blocked');
  assert.equal(receipt.mutationPerformed, false);
  assert.equal(receipt.targetOrigin, TARGET);
  assert.equal(JSON.stringify(receipt).includes('SECRET_DO_NOT_PUBLISH'), false);
  assert.equal(JSON.stringify(receipt).includes('403'), false);
});

test('target projection fails closed instead of reflecting arbitrary input', () => {
  assert.equal(normalizeSafeChiefTarget(TARGET), TARGET);
  assert.equal(normalizeSafeChiefTarget(`${TARGET}/version`), 'UNKNOWN');
  assert.equal(normalizeSafeChiefTarget('https://example.com'), 'UNKNOWN');
  assert.equal(normalizeSafeChiefTarget('not-a-url'), 'UNKNOWN');
});
