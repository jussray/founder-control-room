#!/usr/bin/env node
/** Free-first FCR Buffer reel assembler: authentic media only; never publishes. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, mkdir, mkdtemp, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]);
  return a;
}, []));
const run = (binary, argv) => {
  const res = spawnSync(binary, argv, { encoding: 'utf8', timeout: 180000, maxBuffer: 8_000_000 });
  if (res.error || res.status !== 0) throw Error(`${binary}: ${(res.stderr || res.error?.message || 'failed').slice(-1000)}`);
  return res.stdout;
};
const sha = async p => createHash('sha256').update(await readFile(p)).digest('hex');
const probe = p => {
  const data = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', p]));
  const video = (data.streams || []).find(s => s.codec_type === 'video');
  return { duration: Number(data.format?.duration), video, audio: (data.streams || []).some(s => s.codec_type === 'audio') };
};
const file = (flag) => {
  const p = args[flag];
  if (!p || !existsSync(p)) throw Error(`missing source: --${flag} requires authentic media`);
  return resolve(p);
};
const main = async () => {
  const intro = file('intro');
  const screen = file('screen');
  if (!args.output) throw Error('missing --output');
  const output = resolve(args.output);
  if ([intro, screen].includes(output)) throw Error('output cannot overwrite source');
  if (existsSync(output)) throw Error('output exists; choose a fresh output path');
  if (existsSync(`${output}.receipt.json`)) throw Error('receipt exists; choose a fresh output path');
  const voiceover = args.voiceover ? file('voiceover') : null;
  const world = args.world ? file('world') : null;
  if (voiceover && [intro, screen].includes(voiceover)) throw Error('voiceover needs separate audio media');
  const w = args.width ? Number(args.width) : 1080;
  const h = args.height ? Number(args.height) : 1920;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 256 || h < 448 || w % 2 || h % 2 || h / w < 1.55 || h / w > 2.1) {
    throw Error('must be a portrait output with even dimensions');
  }
  const a = probe(intro), b = probe(screen);
  if (!a.video || !a.audio || a.duration < 3) throw Error('intro must have >=3s camera footage with genuine recorded audio');
  if (!b.video || b.duration < 7) throw Error('screen must have >=7s authentic UI footage');
  if (!b.audio && !voiceover) throw Error('screen without audio requires genuine 7s --voiceover (no fake narration)');
  if (voiceover && probe(voiceover).duration < 7) throw Error('voiceover must be at least 7 seconds');
  const dir = dirname(output);
  await mkdir(dir, { recursive: true });
  const workspace = await mkdtemp(join(dir, '.fcr-video-'));
  const tmp = join(workspace, 'render.mp4');
  try {
    const ffargs = ['-hide_banner','-nostdin','-loglevel','error','-y','-i',intro,'-i',screen];
    let voiceIdx = -1, worldIdx = -1, index = 2;
    if (voiceover) {voiceIdx = index++; ffargs.push('-i',voiceover);}
    if (world) {worldIdx = index++; ffargs.push('-loop','1','-framerate','30','-i',world);}
    const filters = [
      `[0:v]trim=duration=3,setpts=PTS-STARTPTS,fps=30,scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p[v0]`,
      `[1:v]trim=duration=7,setpts=PTS-STARTPTS,fps=30,setsar=1,split[sbg0][sfg0]`,
      worldIdx >= 0 ? `[${worldIdx}:v]trim=duration=7,setpts=PTS-STARTPTS,fps=30,scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},eq=brightness=-0.12[sbg]`
        : `[sbg0]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=24:1,eq=brightness=-0.18[sbg]`,
      `[sfg0]scale=${Math.round(w*0.92)}:${Math.round(h*0.78)}:force_original_aspect_ratio=decrease,format=yuva420p[sfg]`,
      `[sbg][sfg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p,setsar=1[v1]`,
      '[0:a]atrim=duration=3,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=3[a0]',
      `[${voiceIdx >= 0 ? voiceIdx : '1'}:a]atrim=duration=7,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=7[a1]`,
      '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]'
    ];
    ffargs.push('-filter_complex',filters.join(';'),'-map','[v]','-map','[a]','-t','10','-r','30',
      '-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',tmp);
    run('ffmpeg',ffargs);
    run('ffmpeg',['-v','error','-xerror','-i',tmp,'-f','null','-']);
    const inspected = probe(tmp);
    if (!inspected.video || !inspected.audio || inspected.video.width !== w || inspected.video.height !== h ||
      Math.abs(inspected.duration-10)>0.08) throw Error('decode / dimension / duration verification failed');
    const receipt = {
      schema: 'fcr/free-footage-render@v1',
      output_sha256: await sha(tmp),
      source_sha256: { intro: await sha(intro), screen: await sha(screen), ...(voiceover ? {voiceover:await sha(voiceover)} : {}), ...(world ? {world:await sha(world)} : {}) },
      duration_seconds: inspected.duration, width:w, height:h,
      verified_encoding: true, paid_provider_used: false,
      publish_authority: false, buffer_draft_id: null, public_post_url: null,
      review_required: ['founder_visual_approval','on_screen_private_info_check','source_rights_check','truth_claim_check']
    };
    await rename(tmp, output);
    await writeFile(`${output}.receipt.json`,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:'RENDERED_LOCAL_REVIEW_ONLY',output,receipt:`${output}.receipt.json`},null,2));
  } finally {await rm(workspace,{recursive:true,force:true});}
};
main().catch(error=>{console.error(`BLOCKED: ${error.message}`);process.exitCode=1;});