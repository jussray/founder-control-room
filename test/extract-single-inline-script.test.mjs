import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { extractSingleInlineScript } from '../scripts/extract-single-inline-script.mjs';

test('extracts source-owned inline JS from lowercase and uppercase HTML tags', () => {
  assert.equal(extractSingleInlineScript('<script>const result = 1;</script>'), 'const result = 1;');
  assert.equal(extractSingleInlineScript('<SCRIPT>const result = 2;</SCRIPT>'), 'const result = 2;');
  assert.equal(extractSingleInlineScript('<ScRiPt>const result = 3;</sCrIpT>'), 'const result = 3;');
});

test('rejects ambiguous multiple scripts and attributes instead of choosing one', () => {
  assert.equal(extractSingleInlineScript('<script>one()</script><SCRIPT>two()</SCRIPT>'), null);
  assert.equal(extractSingleInlineScript('<SCRIPT src="/untrusted.js"></SCRIPT>'), null);
  assert.equal(extractSingleInlineScript('<script nonce="token">one()</script>'), null);
  assert.equal(extractSingleInlineScript('<script>one()<ScRiPt>two()</script>'), null);
});

test('rejects incomplete or malformed script boundaries', () => {
  assert.equal(extractSingleInlineScript('<script>one()'), null);
  assert.equal(extractSingleInlineScript('<script>one()</SCRIPT attr=oops>'), null);
  assert.equal(extractSingleInlineScript('<script >one()</script>'), null);
  assert.equal(extractSingleInlineScript('<scripting>one()</scripting>'), null);
  assert.equal(extractSingleInlineScript(null), null);
  assert.equal(extractSingleInlineScript(''), null);
});
