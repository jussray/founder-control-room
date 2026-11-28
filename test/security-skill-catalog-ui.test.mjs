import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSkillCatalog, renderSkillCatalog } from '../public/control-room/security-skill-catalog.mjs';
const catalog = JSON.parse(readFileSync(new URL('../docs/security-skill-catalog.v1.json', import.meta.url)));
const response = (body, status = 200) => ({status, ok: status === 200, json: async () => body});
test('uses only same-origin read with no credential forwarding or cache', async () => {
  const result = await readSkillCatalog(async (path, options) => {
    assert.equal(path, '/founder-os/security-skills/catalog');
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, {Accept:'application/json'});
    return response(catalog);
  });
  assert.deepEqual(result, catalog);
});
for (const status of [401,403]) test('denial '+status+' returns no catalog', async () => {
  await assert.rejects(readSkillCatalog(async () => response(catalog,status)), e => e.auth === true);
});
test('unavailable server fails closed', async () => {
  await assert.rejects(readSkillCatalog(async () => response(catalog,503)), /unavailable/);
});
for (const key of ['execution_enabled','auto_fetch','auto_handoff']) test('rejects changed '+key, async () => {
  await assert.rejects(readSkillCatalog(async () => response({...catalog,[key]:true})), /invalid/);
});
test('rejects duplicate skill', async () => {
  await assert.rejects(readSkillCatalog(async () => response({...catalog,records:[catalog.records[0],catalog.records[0],catalog.records[2]]})), /invalid/);
});
test('renders data as text, not HTML, with no action controls', () => {
  const doc = {createElement(tag) {return {tag,children:[],append(...nodes){this.children.push(...nodes)}}}};
  const container = {ownerDocument:doc,replaceChildren(...nodes){this.children=nodes}};
  renderSkillCatalog(container,{...catalog,records:[{...catalog.records[0],purpose:'<img onerror=bad>'}]});
  const card=container.children[2].children[0];
  assert.equal(card.children[1].textContent,'<img onerror=bad>');
  assert.equal(card.children.length,3);
});
