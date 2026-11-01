import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunwayMediaJobAdapter, materializeRunwayOutput } from '../runwayMediaJobAdapter.js';
import type { MediaJobAdapterInput } from '../mediaJobExecution.js';

const taskId = '17f20503-6c24-4c16-946b-35dbbce2af2f';
const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive:true, force:true }); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(),'fcr-runway-')); dirs.push(dir);
  const png = Buffer.alloc(32); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.write('IHDR',12); png.writeUInt32BE(1,16); png.writeUInt32BE(1,20);
  const path = join(dir,'frame.png'); await writeFile(path,png);
  const input: MediaJobAdapterInput = { jobId:'shot-1',projectId:'bip',inputFingerprint:'a'.repeat(64),maxCostUsd:2,request:{model:'gen4.5',promptText:'Camera slowly moves forward.',ratio:'720:1280',duration:10},references:[{id:'approved-frame',path,sha256:createHash('sha256').update(png).digest('hex')}] };
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({id:taskId}),{status:200}));
  const config = {enabled:true,apiKey:'private-test-key',allowedProjectIds:['bip'],generationEligibility:{model:'gen4.5' as const,approved:true,approvalReceiptId:'approved-canary'},maxCostUsdLimit:2,allowedOutputHosts:['media.runwaycdn.com'],authorize:async()=>true,fetchImpl:transport};
  return {input,transport,config};
}
describe('Runway operator-only adapter',()=>{
  it('defaults disabled and makes no transport call',async()=>{
    const f=await fixture();
    await expect(new RunwayMediaJobAdapter({...f.config,enabled:false}).submit(f.input)).rejects.toThrow('RUNWAY_EXECUTION_DISABLED');
    expect(f.transport).not.toHaveBeenCalled();
  });
  it('requires scoped model, project, budget and independent exact-job authorization',async()=>{
    const f=await fixture();
    for(const change of [{generationEligibility:undefined},{allowedProjectIds:['other']},{maxCostUsdLimit:1},{authorize:async()=>false},{apiKey:undefined}]) {
      await expect(new RunwayMediaJobAdapter({...f.config,...change}).submit(f.input)).rejects.toThrow(/RUNWAY_/);
    }
    expect(f.transport).not.toHaveBeenCalled();
  });
  it('submits exact hashed local reference bytes to the fixed API without caller request extras',async()=>{
    const f=await fixture(); f.input.request.promptImage='https://attacker.test/private';
    const result=await new RunwayMediaJobAdapter(f.config).submit(f.input);
    expect(result).toEqual({taskId,state:'PENDING'});
    const [url,options]=f.transport.mock.calls[0];
    expect(url).toBe('https://api.dev.runwayml.com/v1/image_to_video');
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.headers).toMatchObject({'X-Runway-Version':'2024-11-06',Authorization:'Bearer private-test-key'});
    const body=JSON.parse(String(options?.body));
    expect(body.promptImage).toMatch(/^data:image\/png;base64,/);
    expect(createHash('sha256').update(Buffer.from(body.promptImage.split(',')[1],'base64')).digest('hex')).toBe(f.input.references[0].sha256);
    expect(body).toMatchObject({model:'gen4.5',ratio:'720:1280',duration:10});
    expect(String(options?.body)).not.toContain('attacker.test');
  });
  it('rejects changed reference, malformed image, missing or multi-reference before network',async()=>{
    const f=await fixture(); const adapter=new RunwayMediaJobAdapter(f.config);
    await writeFile(f.input.references[0].path,'not-an-image');
    await expect(adapter.submit(f.input)).rejects.toThrow('RUNWAY_REFERENCE_HASH_MISMATCH');
    f.input.references[0].sha256=createHash('sha256').update('not-an-image-but-long').digest('hex');
    await writeFile(f.input.references[0].path,'not-an-image-but-long');
    await expect(adapter.submit(f.input)).rejects.toThrow('RUNWAY_REFERENCE_FORMAT_INVALID');
    await expect(adapter.submit({...f.input,references:[]})).rejects.toThrow('RUNWAY_ONE_APPROVED_FRAME_REQUIRED');
    expect(f.transport).not.toHaveBeenCalled();
  });
  it('does not retry an ambiguous paid submission or expose provider error data',async()=>{
    const f=await fixture(); f.transport.mockRejectedValue(new Error('private-test-key secret provider dump'));
    await expect(new RunwayMediaJobAdapter(f.config).submit(f.input)).rejects.toThrow('RUNWAY_TRANSPORT_OUTCOME_UNKNOWN');
    expect(f.transport).toHaveBeenCalledTimes(1);
    f.transport.mockResolvedValue(new Response('private secret body',{status:429}));
    await expect(new RunwayMediaJobAdapter(f.config).submit(f.input)).rejects.toThrow('RUNWAY_HTTP_429');
    f.transport.mockResolvedValue(new Response(JSON.stringify({id:'bad-id'})));
    await expect(new RunwayMediaJobAdapter(f.config).submit(f.input)).rejects.toThrow('RUNWAY_SUBMISSION_OUTCOME_UNKNOWN');
  });
  it('polls only validated task IDs and reports pending/failed without output claims',async()=>{
    const f=await fixture(); const adapter=new RunwayMediaJobAdapter(f.config);
    await expect(adapter.poll('../account')).rejects.toThrow('RUNWAY_TASK_ID_INVALID');
    expect(f.transport).not.toHaveBeenCalled();
    for(const status of ['PENDING','RUNNING','THROTTLED']) {
      f.transport.mockResolvedValue(new Response(JSON.stringify({id:taskId,status})));
      expect(await adapter.poll(taskId)).toEqual({taskId,state:'PENDING'});
    }
    f.transport.mockResolvedValue(new Response(JSON.stringify({id:taskId,status:'FAILED',failure:'private error'})));
    expect(await adapter.poll(taskId)).toEqual({taskId,state:'FAILED',safeCode:'RUNWAY_TASK_FAILED'});
  });
  it('keeps successful output private, unapproved and host-bound without downloading it',async()=>{
    const f=await fixture();
    f.transport.mockResolvedValue(new Response(JSON.stringify({id:taskId,status:'SUCCEEDED',output:['https://media.runwaycdn.com/clip.mp4?signature=private']})));
    const result=await new RunwayMediaJobAdapter(f.config).poll(taskId);
    expect(result.state).toBe('SUCCEEDED');
    expect(result.output?.metadata).toMatchObject({kind:'GENERATED_REVIEW_REQUIRED',finalApprovalEligible:false,sourceApprovalVerified:false});
    expect(result.output?.sha256).toBeUndefined();
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(f.transport.mock.calls[0][0]).toBe(`https://api.dev.runwayml.com/v1/tasks/${taskId}`);
    for(const output of ['http://media.runwaycdn.com/a','https://127.0.0.1/a','https://evil.test/a','https://u:p@media.runwaycdn.com/a']){
      f.transport.mockResolvedValue(new Response(JSON.stringify({id:taskId,status:'SUCCEEDED',output:[output]})));
      await expect(new RunwayMediaJobAdapter(f.config).poll(taskId)).rejects.toThrow('RUNWAY_OUTPUT_URL_REJECTED');
    }
  });
  it('rejects mismatched response subject and oversized provider bodies',async()=>{
    const f=await fixture();
    f.transport.mockResolvedValue(new Response(JSON.stringify({id:'497f6eca-6276-4993-bfeb-53cbbbba6f08',status:'PENDING'})));
    await expect(new RunwayMediaJobAdapter(f.config).poll(taskId)).rejects.toThrow('RUNWAY_TASK_ID_MISMATCH');
    f.transport.mockResolvedValue(new Response(' '.repeat(1_048_577)));
    await expect(new RunwayMediaJobAdapter(f.config).poll(taskId)).rejects.toThrow('RUNWAY_RESPONSE_TOO_LARGE');
  });
});


describe('private Runway candidate materialization', () => {
  const uri = 'https://media.runwaycdn.com/clip.mp4?signature=private';
  const ready = { taskId, state: 'SUCCEEDED' as const, output: { uri } };
  const hosts = ['media.runwaycdn.com'];
  const mp4 = Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
  it('downloads only once without auth headers and returns actual local hash, never approval',async()=>{
    const f=await fixture(); const dest=join(dirs.at(-1)!, 'candidate.mp4');
    const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(mp4,{headers:{'Content-Type':'video/mp4','Content-Length':String(mp4.length)}}));
    const result=await materializeRunwayOutput(ready,dest,{allowedOutputHosts:hosts,fetchImpl:transport});
    expect(await readFile(dest)).toEqual(mp4);
    expect((await stat(dest)).mode & 0o777).toBe(0o600);
    expect(result.output?.sha256).toBe(createHash('sha256').update(mp4).digest('hex'));
    expect(result.output?.uri).toBe(dest);
    expect(result.output?.metadata).toMatchObject({kind:'GENERATED_REVIEW_REQUIRED',finalApprovalEligible:false,sourceApprovalVerified:false});
    expect(JSON.stringify(result)).not.toContain('signature=private');
    const [,options]=transport.mock.calls[0];
    expect(options?.headers).toBeUndefined(); expect(options?.redirect).toBe('error'); expect(options?.signal).toBeInstanceOf(AbortSignal);
    await expect(materializeRunwayOutput(ready,dest,{allowedOutputHosts:hosts,fetchImpl:transport})).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await readFile(dest)).toEqual(mp4);
    expect(f.input.projectId).toBe('bip');
  });
  it('rejects wrong state, untrusted URLs and local/IP hosts before any network',async()=>{
    await fixture(); const dest=join(dirs.at(-1)!,'candidate.mp4'); const transport=vi.fn<typeof fetch>();
    await expect(materializeRunwayOutput({...ready,state:'PENDING'},dest,{allowedOutputHosts:hosts,fetchImpl:transport})).rejects.toThrow('RUNWAY_OUTPUT_NOT_READY');
    for(const uri of ['http://media.runwaycdn.com/x','https://u:p@media.runwaycdn.com/x','https://media.runwaycdn.com:444/x','https://127.0.0.1/x','https://localhost/x','https://a.internal/x','https://media.runwaycdn.com.evil.com/x']){
      await expect(materializeRunwayOutput({...ready,output:{uri}},dest,{allowedOutputHosts:[...hosts,'localhost','127.0.0.1','a.internal'],fetchImpl:transport})).rejects.toThrow('RUNWAY_OUTPUT_URL_REJECTED');
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects oversized, truncated and non-MP4 candidates and removes only its own incomplete output',async()=>{
    await fixture(); const dest=join(dirs.at(-1)!,'candidate.mp4');
    const cases: { body: Buffer; headers: Record<string, string>; maxBytes: number; code: string }[]=[
      {body:mp4,headers:{'Content-Type':'video/mp4','Content-Length':'99'},maxBytes:128,code:'RUNWAY_DOWNLOAD_INCOMPLETE'},
      {body:mp4,headers:{'Content-Type':'video/mp4'},maxBytes:12,code:'RUNWAY_DOWNLOAD_TOO_LARGE'},
      {body:Buffer.alloc(16),headers:{'Content-Type':'video/mp4'},maxBytes:128,code:'RUNWAY_DOWNLOAD_FORMAT_INVALID'},
      {body:mp4,headers:{'Content-Type':'text/html'},maxBytes:128,code:'RUNWAY_DOWNLOAD_METADATA_INVALID'},
    ];
    for(const c of cases){
      const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(c.body,{headers:c.headers}));
      await expect(materializeRunwayOutput(ready,dest,{allowedOutputHosts:hosts,fetchImpl:transport,maxBytes:c.maxBytes})).rejects.toThrow(c.code);
      await expect(stat(dest)).rejects.toMatchObject({code:'ENOENT'});
    }
  });
  it('sanitizes failed transport and HTTP failures without leaving an output file',async()=>{
    await fixture(); const dest=join(dirs.at(-1)!,'candidate.mp4');
    const transport=vi.fn<typeof fetch>().mockRejectedValue(new Error('private signature/provider payload'));
    await expect(materializeRunwayOutput(ready,dest,{allowedOutputHosts:hosts,fetchImpl:transport})).rejects.toThrow('RUNWAY_DOWNLOAD_FAILED');
    await expect(stat(dest)).rejects.toMatchObject({code:'ENOENT'});
    transport.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.error(new Error('private stream URL signature')); } }), { headers: { 'Content-Type': 'video/mp4' } }));
    await expect(materializeRunwayOutput(ready,dest,{allowedOutputHosts:hosts,fetchImpl:transport})).rejects.toThrow('RUNWAY_DOWNLOAD_FAILED');
    await expect(stat(dest)).rejects.toMatchObject({code:'ENOENT'});
    transport.mockResolvedValue(new Response('private redirect',{status:302,headers:{Location:'http://127.0.0.1/'}}));
    await expect(materializeRunwayOutput(ready,dest,{allowedOutputHosts:hosts,fetchImpl:transport})).rejects.toThrow('RUNWAY_DOWNLOAD_FAILED');
    await expect(stat(dest)).rejects.toMatchObject({code:'ENOENT'});
  });
});
