'use strict';
// Private Sprite entrypoint. No shell, provider keys, source mutation, or merge.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SCHEMA = 'fcr/sprite-governed-proof@v1';
const REPO = 'jussray/founder-control-room';
const URL = 'https://github.com/jussray/founder-control-room.git';
const suites = Object.freeze({
  'verify.access': [
    ['node', '--check', 'scripts/verify-fcr-cloudflare-access-boundary.mjs'],
    ['node', '--test', 'scripts/fcr-access-boundary-policy.node-test.mjs'],
    ['node', '--test', 'scripts/verify-fcr-cloudflare-access-boundary.node-test.mjs'],
    ['node', '--test', 'scripts/fcr-stranger-front-door-contract.node-test.mjs'],
  ],
  'verify.pages-proxy': [
    ['npm', 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
    ['node', '--check', 'public/_worker.js'],
    ['node', 'scripts/sprites/fcr-edge-playwright.mjs'],
  ],
});
const fingerprint = (value) => crypto.createHash('sha256').update(value).digest('hex');
function validate(job) {
  assert(job && typeof job === 'object' && !Array.isArray(job), 'INVALID_JOB');
  assert.deepEqual(Object.keys(job).sort(), ['expectedHeadSha', 'headRef', 'repository', 'requestId', 'schema', 'suite'].sort(), 'UNEXPECTED_FIELDS');
  assert.equal(job.schema, SCHEMA, 'SCHEMA_INVALID');
  assert.equal(job.repository, REPO, 'REPO_DENIED');
  assert.match(job.expectedHeadSha, /^[a-f0-9]{40}$/, 'SHA_INVALID');
  assert.match(job.requestId, /^[a-zA-Z0-9._-]{8,96}$/, 'REQUEST_INVALID');
  assert.match(job.headRef, /^(?:fix|review|feature|main)[\w./-]{0,100}$/, 'REF_DENIED');
  assert(!job.headRef.startsWith('-') && !job.headRef.includes('..') && !job.headRef.endsWith('/'), 'REF_DENIED');
  assert(Object.hasOwn(suites, job.suite), 'SUITE_DENIED');
}
function runExternal(command, args, cwd, timeout=90_000) {
  const result = spawnSync(command, args, {
    cwd, timeout, encoding:'utf8', maxBuffer:1024*1024,
    env:{ PATH:process.env.PATH || '/usr/bin:/bin', HOME:process.env.HOME || '/home/sprite',
      NODE_ENV:'test', CI:'true', // Never forward tokens or arbitrary upstream environment.
    },
  });
  if (result.error || result.status !== 0) throw Error('PROOF_COMMAND_FAILED');
}
function runJob(job, exec = runExternal) {
  validate(job);
  const started = new Date().toISOString();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fcr-sprite-proof-'));
  try {
    exec('git',['clone','--quiet','--depth','1','--filter=blob:none','--single-branch','--branch',job.headRef,URL,temp],temp,45_000);
    const head = spawnSync('git',['rev-parse','HEAD'],{cwd:temp,encoding:'utf8',timeout:5000});
    if(head.status!==0 || head.stdout.trim()!==job.expectedHeadSha) throw Error('STALE_HEAD');
    for (const [binary,...args] of suites[job.suite]) exec(binary,args,temp,90_000);
    const check = spawnSync('git',['status','--porcelain'],{cwd:temp,encoding:'utf8',timeout:5000});
    if(check.status!==0 || check.stdout.trim()) throw Error('WORKTREE_MUTATED');
    return {schema:SCHEMA,repository:REPO,headRef:job.headRef,exactHeadSha:job.expectedHeadSha,
      requestId:job.requestId,suite:job.suite,runStartedAt:started,runFinishedAt:new Date().toISOString(),
      state:'PASS',checks:suites[job.suite].length,intentFingerprintSha256:fingerprint(JSON.stringify(job)),
      mergeAuthorized:false,deployAuthorized:false,providerMutationAuthorized:false};
  } finally {
    // Delete only the fresh job's own ephemeral checkout, never a persistent Sprite workspace.
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
async function main() {
  let raw='';
  for await (const chunk of process.stdin) {
    raw += chunk.toString();
    if(Buffer.byteLength(raw)>4096) throw Error('INPUT_TOO_LARGE');
  }
  const receipt=runJob(JSON.parse(raw));
  console.log(JSON.stringify({result:'PASS',receipt}));
}
if(require.main===module) main().catch(e=>{
  // No paths or potentially sensitive exception messages in external logs.
  console.error(JSON.stringify({result:'BLOCKED',code:['STALE_HEAD','WORKTREE_MUTATED'].includes(e.message)?e.message:'PROOF_BLOCKED'}));
  process.exitCode=1;
});
module.exports={validate,runJob,SCHEMA,suites};
