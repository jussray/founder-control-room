import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRepositorySources,
  readRepositorySources,
  validatePublicDraft,
} from '../scripts/verify-sauce-source-guard.mjs';

const sources = readRepositorySources();

test('current repository evidence satisfies the bounded source contract', () => {
  assert.deepEqual(evaluateRepositorySources(sources), []);
});

test('missing README documentation links fail closed', () => {
  const changed = { ...sources, 'README.md': sources['README.md'].replace('(docs/SOURCE_GUARD.md)', '(docs/missing.md)') };
  assert.ok(evaluateRepositorySources(changed).some((error) => error.includes('docs/SOURCE_GUARD.md')));
});

test('silent deletion policy drift fails closed without changing files', () => {
  const name = 'config/conversion-tracking.contract.json';
  const contract = JSON.parse(sources[name]);
  contract.retention.automaticDeletionEnabled = true;
  assert.ok(evaluateRepositorySources({ ...sources, [name]: JSON.stringify(contract) }).some((error) => error.includes('deletion')));
});

test('identity data cannot silently become an allowed conversion field', () => {
  const name = 'config/conversion-tracking.contract.json';
  const contract = JSON.parse(sources[name]);
  contract.allowedPayloadFields.push('user_id');
  assert.ok(evaluateRepositorySources({ ...sources, [name]: JSON.stringify(contract) }).some((error) => error.includes('identity field')));
});

test('read-only public draft review accepts evidenced claims but does not publish', () => {
  assert.deepEqual(validatePublicDraft({ claims: [
    { status: 'CURRENT', text: 'A source contract was added.', evidenceRef: 'commit:95247a53', observedOn: '2026-10-24' },
    { status: 'HISTORICAL', text: 'A test was previously recorded.', asOf: '2026-10-23' },
  ] }), []);
});

test('unsupported, undated and potentially secret-bearing draft claims fail', () => {
  const errors = validatePublicDraft({ claims: [
    { status: 'UNKNOWN', text: 'Revenue is growing' },
    { status: 'CURRENT', text: 'Launched to customers' },
    { status: 'HISTORICAL', text: 'Previously live' },
    { status: 'CURRENT', text: 'password=verysecretpassword', evidenceRef: 'commit:abc12345', observedOn: '2026-10-24' },
  ] });
  assert.ok(errors.some((error) => error.includes('only CURRENT')));
  assert.ok(errors.some((error) => error.includes('evidence reference')));
  assert.ok(errors.some((error) => error.includes('asOf')));
  assert.ok(errors.some((error) => error.includes('credential marker')));
});
