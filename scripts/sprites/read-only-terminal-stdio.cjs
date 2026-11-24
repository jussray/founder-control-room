'use strict';
const {runJob}=require('./read-only-terminal.cjs');
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk=>{
  input += chunk;
  if (Buffer.byteLength(input,'utf8')>4096) { console.error(JSON.stringify({result:'BLOCKED',code:'ENVELOPE_TOO_LARGE'}));process.exit(2); }
});
process.stdin.on('end',()=>{
 try{
  const job=JSON.parse(input);
  const result=runJob(job);
  console.log(JSON.stringify({result:'PASS',receipt:result}));
 } catch(error){
  console.error(JSON.stringify({result:'BLOCKED',code:error?.message||'UNKNOWN'}));
  process.exitCode=2;
 }
});
