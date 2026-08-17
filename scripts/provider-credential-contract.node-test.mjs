import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyProviderToken } from './provider-credential-contract.mjs';

const ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';

test('accepts a raw printable token', () => {
  const result = classifyProviderToken('cf-test-token_123.ABC', { accountId: ACCOUNT_ID });
  assert.equal(result.headerSafe, true);
  assert.equal(result.classification, 'ok');
});

test('rejects missing token', () => {
  assert.equal(classifyProviderToken('', { accountId: ACCOUNT_ID }).classification, 'missing');
});

test('rejects non-ascii punctuation', () => {
  assert.equal(classifyProviderToken('cf-token-abc”', { accountId: ACCOUNT_ID }).classification, 'non-ascii');
});

test('rejects whitespace without trimming it away', () => {
  const result = classifyProviderToken(' cf-token-abc ', { accountId: ACCOUNT_ID });
  assert.equal(result.classification, 'whitespace');
  assert.equal(result.hasLeadingOrTrailingWhitespace, true);
});

test('rejects Bearer prefix', () => {
  assert.equal(classifyProviderToken('Bearer cf-token-abc').classification, 'bearer-prefix');
});

test('rejects NAME=value wrapper', () => {
  assert.equal(classifyProviderToken('CLOUDFLARE_API_TOKEN=cf-token-abc').classification, 'assignment-wrapper');
});

test('rejects wrapping quotes', () => {
  assert.equal(classifyProviderToken('"cf-token-abc"').classification, 'wrapping-quotes');
});

test('rejects account id substituted for token', () => {
  assert.equal(classifyProviderToken(ACCOUNT_ID, { accountId: ACCOUNT_ID }).classification, 'account-id-substitution');
});
