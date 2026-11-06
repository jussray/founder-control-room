'use strict';
const {runJob,validateJob,schema}=require('./read-only-terminal.cjs');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:'/home/sprite/fcr/workspaces/founder-control-room',encoding:'utf8'}).trim();
const base={schema,repository:'jussray/founder-control-room',expectedHeadSha:sha,requestId:'fcr-read-test-20261031',commandId:'git.head'};
function denied(payload,expected){ assert.throws(()=>runJob(payload),new RegExp(expected)); }
const ok=runJob(base);
assert.equal(ok.exactHeadSha,sha); assert.equal(ok.observedOutput,sha); assert.equal(ok.mergeAuthorized,false);
denied({...base,commandId:'git.push'},'COMMAND_DENIED');
denied({...base,expectedHeadSha:'0'.repeat(40)},'STALE_SOURCE_SHA');
denied({...base,repository:'jussray/Sekret-Bip'},'TARGET_DENIED');
denied({...base,token:'SHOULD_NOT_BE_ACCEPTED'},'UNEXPECTED_FIELDS');
denied({...base,commandId:'verify.unit'},'COMMAND_DENIED');
console.log('READ_ONLY_CONTRACT_PASS; invalid, stale, cross-repo, extra-field, write, and test execution requests denied');
