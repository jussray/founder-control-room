#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const ROOT = '/home/sprite/fcr/workspaces/founder-control-room';
const EVIDENCE = '/home/sprite/fcr/evidence/read-only';
const REPO = 'jussray/founder-control-room';
const schema='fcr/sprite-read-only-terminal@v1';
const allowlist = Object.freeze({
  'git.head':['rev-parse','HEAD'],
  'git.status':['status','--short','--branch'],
  'git.diff-stat':['diff','--stat'],
});
function digest(x){return crypto.createHash('sha256').update(x).digest('hex')}
function git(args){return cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:5000,maxBuffer:16384}).trimEnd()}
function validateJob(job) {
  if (!job || typeof job!=='object' || Array.isArray(job)) throw Error('INVALID_ENVELOPE');
  const keys=Object.keys(job).sort();
  const valid=['commandId','expectedHeadSha','repository','requestId','schema'].sort();
  if (JSON.stringify(keys)!==JSON.stringify(valid)) throw Error('UNEXPECTED_FIELDS');
  if (job.schema!==schema || job.repository!==REPO) throw Error('TARGET_DENIED');
  if (typeof job.expectedHeadSha!=='string'|| !/^[a-f0-9]{40}$/.test(job.expectedHeadSha))throw Error('INVALID_SHA');
  if (typeof job.requestId!=='string'||!/^[a-zA-Z0-9._-]{8,96}$/.test(job.requestId))throw Error('INVALID_REQUEST');
  if (!Object.hasOwn(allowlist,job.commandId))throw Error('COMMAND_DENIED');
}
function runJob(job) {
  validateJob(job);
  const actual=git(['rev-parse','HEAD']);
  if (actual!==job.expectedHeadSha) throw Error('STALE_SOURCE_SHA');
  const output=git(allowlist[job.commandId]);
  if (Buffer.byteLength(output,'utf8')>8192)throw Error('OUTPUT_EXCEEDS_BOUND');
  if (git(['rev-parse','HEAD'])!==actual)throw Error('SOURCE_MOVED_DURING_EXEC');
  return {
    contract:schema,
    requestId:job.requestId,
    repo:REPO,
    exactHeadSha:actual,
    commandId:job.commandId,
    observedOutput:output,
    outputDigestSha256:digest(output),
    intentFingerprintSha256:digest(JSON.stringify(job)),
    capability:'read-only',
    privilegedAuthorityTransferred:false,
    mergeAuthorized:false,
    deploymentAuthorized:false,
    cookieIsAuthentication:false,
    observedAt:new Date().toISOString(),
  };
}
function main(){
  let raw;
  try {
    if(process.argv.length!==3)throw Error('USAGE_JOB_JSON_FILE_REQUIRED');
    const jobPath=path.resolve(process.argv[2]);
    const allowedBase='/home/sprite/fcr/jobs/';
    if(!jobPath.startsWith(allowedBase))throw Error('JOB_PATH_DENIED');
    raw=fs.readFileSync(jobPath,'utf8');
    if(Buffer.byteLength(raw)>4096)throw Error('JOB_TOO_LARGE');
    const job=JSON.parse(raw);
    const receipt=runJob(job);
    fs.mkdirSync(EVIDENCE,{recursive:true,mode:0o700});
    const receiptPath=path.join(EVIDENCE,receipt.requestId+'.json');
    fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({result:'PASS',requestId:receipt.requestId,commandId:receipt.commandId,sha:receipt.exactHeadSha,outputDigestSha256:receipt.outputDigestSha256,receiptPath}));
  } catch(e) {console.error(JSON.stringify({result:'BLOCKED',code:e.message||'UNKNOWN'}));process.exitCode=2}
}
if(require.main===module)main();
module.exports={validateJob,runJob,allowlist,schema};
