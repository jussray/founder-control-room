import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('./free_buffer_video.mjs', import.meta.url).pathname;
function cmd(bin, args) {const p = spawnSync(bin,args,{encoding:'utf8',timeout:90000}); if(p.error)throw p.error;return p;}
function makeClip(path,secs,withAudio=true){
  const args=['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x568:rate=30'];
  if(withAudio)args.push('-f','lavfi','-i','sine=frequency=220:sample_rate=48000');
  args.push('-t',String(secs),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p');
  if(withAudio) args.push('-c:a','aac');
  args.push(path);
  assert.equal(cmd('ffmpeg',args).status,0);
}
function makeClipWithShortAudio(path, videoSeconds, audioSeconds) {
  const args=['-hide_banner','-loglevel','error','-y',
    '-f','lavfi','-i','testsrc2=size=320x568:rate=30',
    '-f','lavfi','-i','sine=frequency=220:sample_rate=48000',
    '-filter_complex',`[1:a]atrim=duration=${audioSeconds}[short]`,
    '-map','0:v','-map','[short]','-t',String(videoSeconds),
    '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',path];
  assert.equal(cmd('ffmpeg',args).status,0);
}

test('rejects intro and screen audio that ends before the authentic footage segment',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
  const fullIntro=join(d,'intro.mp4'),fullScreen=join(d,'screen.mp4');
  const shortIntro=join(d,'intro-short-audio.mp4'),shortScreen=join(d,'screen-short-audio.mp4');
  makeClip(fullIntro,3.5,true);makeClip(fullScreen,7.5,true);
  makeClipWithShortAudio(shortIntro,3.5,0.6);
  makeClipWithShortAudio(shortScreen,7.5,0.8);
  for(const [name,intro,screen] of [
    ['intro',shortIntro,fullScreen],
    ['screen',fullIntro,shortScreen],
  ]){
   const output=join(d,name+'-out.mp4');
   const r=cmd('node',[script,'--intro',intro,'--screen',screen,'--output',output,'--width','270','--height','480']);
   assert.notEqual(r.status,0,`A full-length video with truncated ${name} audio must be rejected`);
   assert.match(r.stderr,new RegExp(name+'.*audio','i'));
   await assert.rejects(access(output));
  }
 }finally{await rm(d,{recursive:true,force:true})}
});
test('rejects a voiceover with fewer than seven seconds of recorded audio',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
  const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4'),voice=join(d,'short.m4a'),output=join(d,'out.mp4');
  makeClip(intro,3.5,true);makeClip(screen,7.5,false);
  assert.equal(cmd('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=250:sample_rate=48000','-t','1','-c:a','aac',voice]).status,0);
  const r=cmd('node',[script,'--intro',intro,'--screen',screen,'--voiceover',voice,'--output',output,'--width','270','--height','480']);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/voiceover.*7 seconds/i);
  await assert.rejects(access(output));
 }finally{await rm(d,{recursive:true,force:true})}
});

function makeClipWithShortVideo(path, videoSeconds, audioSeconds) {
  const args=['-hide_banner','-loglevel','error','-y',
    '-f','lavfi','-i','testsrc2=size=320x568:rate=30',
    '-f','lavfi','-i','sine=frequency=220:sample_rate=48000',
    '-filter_complex',`[0:v]trim=duration=${videoSeconds}[shortv]`,
    '-map','[shortv]','-map','1:a','-t',String(audioSeconds),
    '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',path];
  assert.equal(cmd('ffmpeg',args).status,0);
}
test('rejects shortened intro and screen video streams padded by full-length audio',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
  const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4');
  const shortIntro=join(d,'intro-short-video.mp4'),shortScreen=join(d,'screen-short-video.mp4');
  makeClip(intro,3.5,true);makeClip(screen,7.5,true);
  makeClipWithShortVideo(shortIntro,0.8,3.5);
  makeClipWithShortVideo(shortScreen,1,7.5);
  for(const [name,clipIntro,clipScreen] of [
    ['intro',shortIntro,screen],['screen',intro,shortScreen],
  ]){
   const output=join(d,name+'-out.mp4');
   const r=cmd('node',[script,'--intro',clipIntro,'--screen',clipScreen,
      '--output',output,'--width','270','--height','480']);
   assert.notEqual(r.status,0,`Truncated ${name} video must not pass on the audio container duration`);
   assert.match(r.stderr,new RegExp(name,'i'));
   await assert.rejects(access(output));
  }
 }finally{await rm(d,{recursive:true,force:true})}
});

test('no source footage fails closed with no fabricated reel',async()=>{
  const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
    const r=cmd('node',[script,'--intro',join(d,'missing.mp4'),'--screen',join(d,'missing2.mp4'),'--output',join(d,'out.mp4')]);
    assert.notEqual(r.status,0);assert.match(r.stderr,/missing source/i);
    await assert.rejects(access(join(d,'out.mp4')));
  }finally{await rm(d,{recursive:true,force:true})}
});
test('requires full audio during screen recording; no fake narration',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
   makeClip(join(d,'intro.mp4'),3.5,true);makeClip(join(d,'screen.mp4'),7.5,false);
   const r=cmd('node',[script,'--intro',join(d,'intro.mp4'),'--screen',join(d,'screen.mp4'),'--output',join(d,'out.mp4')]);
   assert.notEqual(r.status,0);assert.match(r.stderr,/voiceover|audio/i);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('10s reel is decoded, hash-receipted, and source files untouched',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
   const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4'),out=join(d,'out.mp4');
   makeClip(intro,3.5);makeClip(screen,7.5);
   const r=cmd('node',[script,'--intro',intro,'--screen',screen,'--output',out,'--width','270','--height','480']);
   assert.equal(r.status,0,r.stderr);const receipt=JSON.parse(await readFile(out+'.receipt.json','utf8'));
   assert.equal(receipt.verified_encoding,true);assert.equal(receipt.publish_authority,false);assert.equal(receipt.paid_provider_used,false);
   assert.match(receipt.output_sha256,/^[0-9a-f]{64}$/);assert.equal(receipt.width,270);assert.equal(receipt.height,480);
   const p=cmd('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',out]);
   assert.ok(Math.abs(Number(p.stdout)-10)<.08,p.stdout);
   assert.equal(cmd('ffmpeg',['-v','error','-i',out,'-f','null','-']).status,0);
   assert.ok((await readFile(intro)).length>0);
 }finally{await rm(d,{recursive:true,force:true})}
});

test('optional approved world and recorded voiceover render without invented UI',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
   const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4'),voice=join(d,'voice.m4a'),world=join(d,'world.png'),out=join(d,'out.mp4');
   makeClip(intro,3.5,true); makeClip(screen,7.5,false);
   assert.equal(cmd('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=250:sample_rate=48000','-t','7.5','-c:a','aac',voice]).status,0);
   assert.equal(cmd('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=black:s=320x568','-frames:v','1',world]).status,0);
   const p=cmd('node',[script,'--intro',intro,'--screen',screen,'--world',world,'--voiceover',voice,'--output',out,'--width','270','--height','480']);
   assert.equal(p.status,0,p.stderr);
   const receipt=JSON.parse(await readFile(out+'.receipt.json','utf8'));
   assert.ok(receipt.source_sha256.world);assert.ok(receipt.source_sha256.voiceover);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('never overwrites existing output or source footage',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
   const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4');
   makeClip(intro,3.5,true);makeClip(screen,7.5,true);
   const p=cmd('node',[script,'--intro',intro,'--screen',screen,'--output',intro]);
   assert.notEqual(p.status,0);assert.match(p.stderr,/overwrite|exists/i);
 }finally{await rm(d,{recursive:true,force:true})}
});


test('rejects upscaling small source into false high-resolution export',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
  const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4');
  makeClip(intro,3.5);makeClip(screen,7.5);
  const out=join(d,'big.mp4');
  const p=cmd('node',[script,'--intro',intro,'--screen',screen,'--output',out,'--width','1080','--height','1920']);
  assert.notEqual(p.status,0, 'Upscaling 320px video must not be treated as production-quality 1080p');
  assert.match(p.stderr,/upscal|resolution/i);
  await assert.rejects(access(out));
 }finally{await rm(d,{recursive:true,force:true})}
});

test('refuses to replace dangling symlink output or receipt',async()=>{
 const {symlink,lstat}=await import('node:fs/promises');
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
  const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4');
  makeClip(intro,3.5);makeClip(screen,7.5);
  const out=join(d,'out.mp4');
  await symlink(join(d,'nonexistent.mp4'),out);
  const p=cmd('node',[script,'--intro',intro,'--screen',screen,'--output',out,'--width','270','--height','480']);
  assert.notEqual(p.status,0);
  assert.match(p.stderr,/exists|symlink|overwrite/i);
  assert.ok((await lstat(out)).isSymbolicLink());
 }finally{await rm(d,{recursive:true,force:true})}
});


test('overlay text requires an explicit approved font; no generic fallback',async()=>{
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
  const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4');
  makeClip(intro,3.5);makeClip(screen,7.5);
  const p=cmd('node',[script,'--intro',intro,'--screen',screen,'--intro-title','Why Buffer?', '--output',join(d,'out.mp4'),'--width','270','--height','480']);
  assert.notEqual(p.status,0);assert.match(p.stderr,/font/i);
 }finally{await rm(d,{recursive:true,force:true})}
});

test('approved lower thirds are rendered using text files and fingerprinted',async()=>{
 const {existsSync}=await import('node:fs');
 const font=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'].find(existsSync);
 assert.ok(font,'CI must provide an installed test font');
 const d=await mkdtemp(join(tmpdir(),'free-video-'));try{
  const intro=join(d,'intro.mp4'),screen=join(d,'screen.mp4'),out=join(d,'out.mp4');
  makeClip(intro,3.5);makeClip(screen,7.5);
  const p=cmd('node',[script,'--intro',intro,'--screen',screen,'--intro-title',"The Buffer test: here's why",'--screen-title','FCR + PromptOS • evidence first','--font-file',font,'--output',out,'--width','270','--height','480']);
  assert.equal(p.status,0,p.stderr);
  const receipt=JSON.parse(await readFile(out+'.receipt.json','utf8'));
  assert.match(receipt.overlay_text_sha256?.intro||'',/^[0-9a-f]{64}$/);
  assert.match(receipt.font_sha256||'',/^[0-9a-f]{64}$/);
  assert.equal(receipt.publish_authority,false);
 }finally{await rm(d,{recursive:true,force:true})}
});
