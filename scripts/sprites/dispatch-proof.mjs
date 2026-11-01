import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA='fcr/sprite-governed-proof@v1';
const REPO='jussray/founder-control-room';
const SPRITE='fcr-governed-exec';
const ENTRYPOINT='/home/sprite/fcr/runner/fcr-governed-proof-stdio.cjs';
const MAX_BYTES=16_384;
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=msg=>{throw new Error(msg)};
function validateInput({headRef,expectedHeadSha,suite,requestId}) {
  if(!/^(?:fix|review|feature|main)[\w./-]{0,100}$/.test(headRef||'') ||
    headRef.includes('..') || headRef.endsWith('/'))fail('Invalid branch');
  if(!/^[a-f0-9]{40}$/.test(expectedHeadSha||''))fail('Invalid SHA');
  if(!['verify.access','verify.pages-proxy'].includes(suite))fail('Suite not permitted');
  if(!/^[a-zA-Z0-9._-]{8,96}$/.test(requestId))fail('Invalid request ID');
  return {schema:SCHEMA,repository:REPO,headRef,expectedHeadSha,requestId,suite};
}
function parseResponse(raw,job) {
  // The Sprites exec stream ends with an exit control frame. Never accept a
  // PASS line when its process subsequently exited nonzero.
  const exitMarker=raw.lastIndexOf('\x03');
  if(exitMarker>=0 && raw.charCodeAt(exitMarker+1)!==0)fail('Sprite process did not exit successfully');
  const candidates=raw.replace(/[\u0000-\u001f]/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
  const record=candidates.map(line=>{try{return JSON.parse(line)}catch{return null}}).find(x=>x?.result==='PASS'&&x.receipt);
  const r=record?.receipt;
  if(!r||r.schema!==SCHEMA||r.repository!==REPO||r.headRef!==job.headRef||
    r.exactHeadSha!==job.expectedHeadSha||r.requestId!==job.requestId||r.suite!==job.suite||
    r.state!=='PASS'||r.mergeAuthorized!==false||r.deployAuthorized!==false||
    r.providerMutationAuthorized!==false||r.intentFingerprintSha256!==digest(JSON.stringify(job))||
    !Number.isInteger(r.checks)||r.checks<=0)fail('Sprite proof receipt invalid or missing');
  return r;
}
export async function dispatchFcrSpriteProof({headRef,expectedHeadSha,suite,requestId='fcr-'+randomUUID()},
  {token=process.env.SPRITES_FCR_EXEC_TOKEN,transport=fetch}={}) {
  const job=validateInput({headRef,expectedHeadSha,suite,requestId});
  if(!token||token.length<12||/\s/.test(token))fail('Authorized Sprite transport unavailable');
  const endpoint=new URL('https://api.sprites.dev/v1/sprites/'+SPRITE+'/exec');
  endpoint.searchParams.append('cmd','node');
  endpoint.searchParams.append('cmd',ENTRYPOINT);
  endpoint.searchParams.set('dir','/home/sprite/fcr/runner');
  endpoint.searchParams.set('stdin','true');
  const response=await transport(endpoint.toString(),{
    method:'POST',redirect:'manual',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream'},
    body:JSON.stringify(job),signal:AbortSignal.timeout(110_000),
  });
  if(response.status!==200||!response.body)fail('Sprite transport failed');
  const chunks=[];let total=0;
  for await(const chunk of response.body){total+=chunk.byteLength;if(total>MAX_BYTES)fail('Sprite output exceeded limit');chunks.push(chunk)}
  const raw=new TextDecoder().decode(Buffer.concat(chunks));
  return parseResponse(raw,job);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    if(process.argv.length!==5)fail('Usage: node scripts/sprites/dispatch-proof.mjs <ref> <sha> <suite>');
    const receipt=await dispatchFcrSpriteProof({headRef:process.argv[2],expectedHeadSha:process.argv[3],suite:process.argv[4]});
    console.log(JSON.stringify(receipt));
  }catch{
    // Exclude the provider error body, transport URL, tokens, and response data.
    console.error('FCR Sprite proof blocked; check server-held authority and exact inputs.');
    process.exitCode=1;
  }
}
