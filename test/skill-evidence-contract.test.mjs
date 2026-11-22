import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const base = new URL('../skills/', import.meta.url);
const validationMap = await readFile(new URL('validation-map/SKILL.md', base), 'utf8');
const premiseStrike = await readFile(new URL('premise-strike/SKILL.md', base), 'utf8');

function hasContract(doc, { name, terms }) {
  if (!doc.startsWith('---\n')) return false;
  const header = doc.split('\n---\n', 2)[0];
  if (!header.includes('\nname: ' + name + '\n')) return false;
  if (!header.includes('description:')) return false;
  return terms.every((term) => doc.includes(term));
}
const mapTerms = [
  'STATED and INFERRED count for *map coverage*, not for external demand validation',
  'Build requires independently checked evidence of an external customer action',
  'No verified demand means Hold',
  'A prototype to gather evidence is not a validated commercial launch',
];
const strikeTerms = [
  'A lead not contacted successfully after one attempt is UNREACHED',
  'Do not initiate follow-up outreach without founder authorization',
  'Stop when the cap is met, contact is unwanted',
];
test('validation-map requires external-demand proof before Build', () => {
  assert.equal(hasContract(validationMap, { name: 'validation-map', terms: mapTerms }), true);
  assert.match(validationMap, /A citation label by itself is not verification/);
});
test('premise-strike does not kill unreachable leads or authorize follow-up', () => {
  assert.equal(hasContract(premiseStrike, { name: 'premise-strike', terms: strikeTerms }), true);
});
test('negative fixtures prove each contract fails when a load-bearing requirement is removed', () => {
  for (const term of mapTerms) {
    const broken = validationMap.replace(term, 'OMITTED');
    assert.equal(hasContract(broken, { name: 'validation-map', terms: mapTerms }), false, term);
  }
  for (const term of strikeTerms) {
    const broken = premiseStrike.replace(term, 'OMITTED');
    assert.equal(hasContract(broken, { name: 'premise-strike', terms: strikeTerms }), false, term);
  }
});
