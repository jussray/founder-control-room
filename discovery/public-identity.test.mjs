import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('public page identifies FCR and shared publisher',()=>{const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const g=JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);assert.deepEqual(g,{"@context":"https://schema.org","@type":"SoftwareApplication","@id":"https://www.foundercontrolroom.org/#application","name":"Founder Control Room","url":"https://www.foundercontrolroom.org/","publisher":{"@type":"Organization","@id":"https://www.jussco.company/#organization","name":"Juss & Co","url":"https://www.jussco.company/"}});});
