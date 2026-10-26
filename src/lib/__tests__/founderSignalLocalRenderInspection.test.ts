import { createHash } from 'node:crypto';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FFMPEG_RENDER_CONTRACT, FFMPEG_RENDER_EXECUTION_SCOPE, type FfmpegRenderResult } from '../mediaFfmpegRender.js';
import { inspectFounderSignalLocalFfmpegRender } from '../founderSignalLocalRenderInspection.js';

function syntheticMp4Signature(): Buffer {
  const bytes=Buffer.alloc(40);
  bytes.writeUInt32BE(24,0);
  bytes.write('ftyp',4);
  bytes.write('isom',8);
  return bytes; // signature-only fixture; NOT a playable video
}
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
function fixture(outputPath: string, bytes: Buffer): FfmpegRenderResult {
  return {
    kind:'RENDERED',contract:FFMPEG_RENDER_CONTRACT,
    executionScope:FFMPEG_RENDER_EXECUTION_SCOPE,outputPath,
    sha256:sha(bytes),bytes:bytes.length,inputFingerprint:'a'.repeat(64),
    sourceAssets:[],fonts:{regularSha256:'a'.repeat(64),boldSha256:'b'.repeat(64)},
    ffmpegVersion:'synthetic',ffprobeVersion:'synthetic',
    probe:{width:320,height:180,durationSec:1,videoCodec:'h264',audioCodec:null,frameCount:24},
    motionClass:'GRAPHIC_ANIMATION',truthAuthority:false,publishAuthority:false,
  };
}
describe('FSE local FFmpeg rendered-byte readback',()=>{
  it('matches an actual file under a configured trusted root without granting source, rights or publication proof',async()=>{
    const root=await mkdtemp(join(tmpdir(),'fse-render-byte-'));
    try{
      const mp4=syntheticMp4Signature(),path=join(root,'work.mp4');
      await writeFile(path,mp4);
      const x=await inspectFounderSignalLocalFfmpegRender(fixture(path,mp4),{trustedOutputRoot:root});
      expect(x.status).toBe('LOCAL_FFMPEG_RECEIPT_BYTE_MATCH__NOT_RELEASE_PROOF');
      expect(x.bytesObserved).toBe(mp4.length);
      expect(x.observedSha256).toBe(sha(mp4));
      expect(x.byteHashMatches).toBe(true);
      expect(x.rendererProvenanceAuthenticated).toBe(false);
      expect(x.decodedVideoValidated).toBe(false);
      expect(x.rightsVerified).toBe(false);
      expect(x.grantsDraftAuthority).toBe(false);
      expect(x.grantsPublicationAuthority).toBe(false);
    }finally{await rm(root,{recursive:true,force:true});}
  });

  it('holds escaped output paths, symlinks and absent trusted roots',async()=>{
    const root=await mkdtemp(join(tmpdir(),'fse-render-root-'));
    const outside=await mkdtemp(join(tmpdir(),'fse-render-outside-'));
    const mp4=syntheticMp4Signature();
    try{
      const path=join(outside,'outside.mp4');await writeFile(path,mp4);
      const traversal=await inspectFounderSignalLocalFfmpegRender(fixture(path,mp4),{trustedOutputRoot:root});
      expect(traversal.reason).toBe('RENDER_PATH_OUTSIDE_TRUSTED_ROOT');
      const link=join(root,'alias.mp4');await symlink(path,link);
      const forged=await inspectFounderSignalLocalFfmpegRender(fixture(link,mp4),{trustedOutputRoot:root});
      expect(forged.status).toBe('HOLD_UNVERIFIED');
      const noRoot=await inspectFounderSignalLocalFfmpegRender(fixture(link,mp4),{trustedOutputRoot:'relative'});
      expect(noRoot.reason).toBe('TRUSTED_RENDER_ROOT_MISSING');
    }finally{
      await rm(root,{recursive:true,force:true});
      await rm(outside,{recursive:true,force:true});
    }
  });

  it('holds changed media bytes and incorrect render receipt size',async()=>{
    const root=await mkdtemp(join(tmpdir(),'fse-render-mutate-'));
    const mp4=syntheticMp4Signature();
    try{
      const path=join(root,'render.mp4');await writeFile(path,mp4);
      const prior=fixture(path,mp4);
      const changed=Buffer.from(mp4);changed[30]^=1;await writeFile(path,changed);
      const bad=await inspectFounderSignalLocalFfmpegRender(prior,{trustedOutputRoot:root});
      expect(bad.reason).toBe('RENDER_BYTES_OR_CONTAINER_MISMATCH');
      const smaller=await inspectFounderSignalLocalFfmpegRender({...prior,bytes:1},{trustedOutputRoot:root});
      expect(smaller.reason).toBe('RENDER_FILE_NOT_REGULAR_OR_SIZE_MISMATCH');
    }finally{await rm(root,{recursive:true,force:true});}
  });

  it('holds forged release authority and synthetic non-render receipts before any file read',async()=>{
    const missing='/not-a-real-dir/file.mp4';
    const mp4=syntheticMp4Signature();
    const invalid=await inspectFounderSignalLocalFfmpegRender(
      {...fixture(missing,mp4),publishAuthority:true},{trustedOutputRoot:tmpdir()});
    expect(invalid.reason).toBe('RENDER_RECEIPT_NOT_ACCEPTABLE');
    const unrendered=await inspectFounderSignalLocalFfmpegRender(
      {kind:'CAPABILITY_UNAVAILABLE',reason:'none'},{trustedOutputRoot:tmpdir()});
    expect(unrendered.reason).toBe('RENDER_RECEIPT_NOT_ACCEPTABLE');
  });

  it('holds missing output files without disclosing filesystem errors',async()=>{
    const root=await mkdtemp(join(tmpdir(),'fse-render-missing-'));
    try{
      const r=await inspectFounderSignalLocalFfmpegRender(
        fixture(join(root,'missing.mp4'),syntheticMp4Signature()),{trustedOutputRoot:root});
      expect(r.reason).toBe('LOCAL_RENDER_READBACK_FAILED');
      expect(JSON.stringify(r)).not.toContain(root);
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
