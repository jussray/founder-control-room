import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { reviewReceipts, receiptPayload, approvalDigest } from '../scripts/external-skill-receipts.mjs';
const gates = ['pin-revision', 'license-review', 'security-review', 'sandbox-proof', 'runtime-compatibility', 'founder-approval'];
const scope = { skillId:'repomix', repository:'yamadashy/repomix', revision:'a'.repeat(40), destination:'fcr', artifactSha256:'b'.repeat(64) };
const now = Date.parse('2026-11-24T12:00:00Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const trust = new Map([['reviewer', { publicKey, gates: gates.slice(0,-1) }]]);
const founder = generateKeyPairSync('ed25519');
trust.set('founder', { publicKey: founder.publicKey, gates:['founder-approval'] });
function signed(gate, evidenceSha256, patch={}) {
  const keyId=gate==='founder-approval'?'founder':'reviewer';
  const receipt={...scope, gate, evidenceSha256, keyId, issuedAt:now-1000, expiresAt:now+1000, ...patch};
  receipt.signature=sign(null,receiptPayload(receipt),keyId==='founder'?founder.privateKey:privateKey).toString('base64');
  return receipt;
}
function fixture() {
  const receipts=gates.slice(0,-1).map(gate=>signed(gate,createHash('sha256').update(gate).digest('hex')));
  receipts.push(signed('founder-approval',approvalDigest(receipts)));
  return receipts;
}
const check=receipts=>reviewReceipts(scope,receipts,trust,now);
test('all signed exact-scope receipts permit review only',()=>{assert.deepEqual(check(fixture()),{reviewComplete:true,executionAllowed:false,reasons:[]});});
test('missing or duplicate gate fails',()=>{const r=fixture();assert.equal(check(r.slice(1)).reviewComplete,false);assert.equal(check([...r,r[0]]).reviewComplete,false);});
test('revision, artifact, destination and repository mismatch fail even when signed',()=>{for(const patch of [{revision:'c'.repeat(40)},{artifactSha256:'c'.repeat(64)},{destination:'chief'},{repository:'other/repo'}]){const r=fixture();r[0]=signed(r[0].gate,r[0].evidenceSha256,patch);assert.equal(check(r).reviewComplete,false);}});
test('tampering and expiry fail',()=>{const r=fixture();r[0].signature='invalid';assert.equal(check(r).reviewComplete,false);assert.equal(reviewReceipts(scope,fixture(),trust,now+2000).reviewComplete,false);});
test('founder approval cannot be replayed over changed evidence',()=>{const r=fixture();r[0]=signed(r[0].gate,'d'.repeat(64));assert.equal(check(r).reviewComplete,false);});
test('untrusted and wrong-role signing keys fail',()=>{assert.equal(reviewReceipts(scope,fixture(),new Map(),now).reviewComplete,false);const wrong=new Map(trust);wrong.set('founder',{publicKey:founder.publicKey,gates:['security-review']});assert.equal(reviewReceipts(scope,fixture(),wrong,now).reviewComplete,false);});
test('invalid input and mutable revision fail closed',()=>{assert.equal(check(null).reviewComplete,false);assert.equal(reviewReceipts({...scope,revision:'main'},fixture(),trust,now).reviewComplete,false);});
