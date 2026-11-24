import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync(new URL('./portfolio-registry.json',import.meta.url),'utf8'));
test('registry preserves five independent identities and source-only evidence',()=>{assert.equal(r.projects.length,5);assert.equal(new Set(r.projects.map(p=>p.entityId)).size,5);assert.equal(r.authority,'independent-peer-products');assert.equal(r.publicationStatus,'draft');for(const p of r.projects){assert.equal(p.productionStatus,'UNKNOWN');assert.deepEqual(p.verifiedCapabilities,[]);assert.match(p.initialValidation.commit,/^[a-f0-9]{40}$/);assert.equal(p.initialValidation.scope,'draft metadata validation only');assert.equal(p.initialValidation.status,'success');assert.match(p.initialValidation.url,/^https:\/\/github\.com\/jussray\/[^/]+\/actions\/runs\/\d+$/);}});
