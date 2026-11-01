'use strict';
const assert=require('node:assert/strict');
const {validate,SCHEMA,suites}=require('./fcr-governed-proof-stdio.cjs');
const job={schema:SCHEMA,repository:'jussray/founder-control-room',headRef:'fix/fcr-access-split-public-worker',
 expectedHeadSha:'f1d39dbb931b7546eca9f8a40916186239cf99b1',
 requestId:'fcr-proof-test-20261101',suite:'verify.access'};
validate(job);
for(const changed of [
 {...job,suite:'git.push'}, {...job,repository:'jussray/Sekret-Bip'},
 {...job,headRef:'--upload-pack=x'}, {...job,headRef:'../../secrets'},
 {...job,expectedHeadSha:'main'},{...job,token:'leak'}
])assert.throws(()=>validate(changed));
assert.deepEqual(Object.keys(suites).sort(),['verify.access','verify.pages-proxy']);
console.log('SPRITE_PROOF_CONTRACT_PASS: exact repo/ref/sha, fixed suites, no extra fields');
