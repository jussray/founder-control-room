import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  checkAuthorizedFounderSignalMedia, type AuthenticatedMediaReader, type AuthorizedMediaSnapshot,
} from '../founderSignalAuthenticatedMediaReader.js';
import type { AssetRegistryEntryV1 } from '../mediaRouter.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bRZsAAAAASUVORK5CYII=', 'base64');
const sha=createHash('sha256').update(png).digest('hex');
const req={principalId:'founder-person-01', workspaceId:'fcr-workspace-01',
  projectId:'founder-project-01',assetId:'asset-001',expectedSha256:sha};
async function* chunks(bytes: Uint8Array=png, chunkSize=7) {
  for (let i=0;i<bytes.length;i+=chunkSize) yield bytes.subarray(i,i+chunkSize);
}
const registry=(): AssetRegistryEntryV1 => ({
  assetId:req.assetId,workspaceId:req.workspaceId,projectId:req.projectId,
  kind:'image',status:'promoted',mediaExecutionReceiptId:'render-receipt-01',
  parentAssetIds:[],promptFingerprint:'sample',referenceAssetIds:[],
  tags:[],lanes:[],rights:{commercialUseStatus:'allowed',reusableAcrossProjects:false,
    reusableAcrossProjectsAuthorityRecordId:null,domainAuthorityGranted:true,
    domainAuthorityRecordId:'rights-record-01'},
  outcome:{shipped:false,published:false,conversionEvidenceIds:[]},
  createdAt:'2026-10-26T00:00:00.000Z',
});
const snap=(): AuthorizedMediaSnapshot => ({
  registry:registry(),objectId:'stored-object-01',objectVersion:'v0001',
  mediaMime:'image/png',byteCount:png.length,sha256:sha,bytes:chunks(),
});
const reader=(value: AuthorizedMediaSnapshot | null): AuthenticatedMediaReader => ({
  openAuthorizedVersion:vi.fn(async()=>value),
});
describe('Founder Signal authorized version-bound media bridge',()=>{
  it('binds principal, project, version and real byte integrity but never grants release authority',async()=>{
    const r=reader(snap());
    const result=await checkAuthorizedFounderSignalMedia(req,r);
    expect(result.status).toBe('LOCAL_AUTHORIZED_READER_BYTE_MATCH__NOT_RELEASE_PROOF');
    expect(result.reason).toBeNull();
    expect(result.readerAuthorizationAsserted).toBe(true);
    expect(result.byteHashMatches).toBe(true);
    expect(result.mediaByteCount).toBe(png.length);
    expect(result.observedSha256).toBe(sha);
    expect(result.receiptFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.originIndependentlyAudited).toBe(false);
    expect(result.licenseIndependentlyChecked).toBe(false);
    expect(result.founderApproved).toBe(false);
    expect(result.handoffReady).toBe(false);
    expect(Object.values(result.authority)).toEqual([false,false,false,false]);
    expect(r.openAuthorizedVersion).toHaveBeenCalledWith({
      principalId:req.principalId,workspaceId:req.workspaceId,
      projectId:req.projectId,assetId:req.assetId,
    });
  });
  it('requires a server-supplied trusted reader and bounded server scopes',async()=>{
    const absent=await checkAuthorizedFounderSignalMedia(req,null as unknown as AuthenticatedMediaReader);
    expect(absent.reason).toBe('TRUSTED_READER_NOT_CONFIGURED');
    const r=reader(snap());
    const bad=await checkAuthorizedFounderSignalMedia({...req,assetId:'../private'},r);
    expect(bad.reason).toBe('INVALID_SCOPED_ASSET_REQUEST');
    expect(r.openAuthorizedVersion).not.toHaveBeenCalled();
  });
  it('holds missing asset or unauthorized principal without byte access',async()=>{
    const r=reader(null);const x=await checkAuthorizedFounderSignalMedia(req,r);
    expect(x.reason).toBe('ASSET_UNAVAILABLE_OR_UNAUTHORIZED');
    expect(x.readerAuthorizationAsserted).toBe(false);
  });
  it('denies wrong tenant, project and source asset identities',async()=>{
    for(const override of [
      {workspaceId:'other-workspace'},
      {projectId:'other-project'},
      {assetId:'other-asset'},
    ]) {
      const bad=snap();bad.registry={...bad.registry,...override};
      const x=await checkAuthorizedFounderSignalMedia(req,reader(bad));
      expect(x.reason).toBe('REGISTRY_SCOPE_STATUS_OR_RIGHTS_BLOCKED');
      expect(x.authority.canDraft).toBe(false);
    }
  });
  it('holds candidate, revoked, restricted and unapproved rights',async()=>{
    const failures=[
      (v:AuthorizedMediaSnapshot)=>{v.registry.status='candidate';},
      (v:AuthorizedMediaSnapshot)=>{v.registry.status='revoked';},
      (v:AuthorizedMediaSnapshot)=>{v.registry.rights.commercialUseStatus='unknown';},
      (v:AuthorizedMediaSnapshot)=>{v.registry.rights.domainAuthorityGranted=false;},
      (v:AuthorizedMediaSnapshot)=>{v.registry.rights.domainAuthorityRecordId=null;},
      (v:AuthorizedMediaSnapshot)=>{v.registry.mediaExecutionReceiptId='';},
    ];
    for(const edit of failures) {
      const bad=snap();edit(bad);
      const x=await checkAuthorizedFounderSignalMedia(req,reader(bad));
      expect(x.reason).toBe('REGISTRY_SCOPE_STATUS_OR_RIGHTS_BLOCKED');
      expect(x.byteHashMatches).toBe(false);
    }
  });
  it('rejects fake object version, mismatched expected SHA and MIME confusion',async()=>{
    const bad=snap();bad.objectVersion='';
    expect((await checkAuthorizedFounderSignalMedia(req,reader(bad))).reason)
      .toBe('VERSION_BOUND_OBJECT_METADATA_MISMATCH');
    const other=snap();other.sha256='f'.repeat(64);
    expect((await checkAuthorizedFounderSignalMedia(req,reader(other))).reason)
      .toBe('VERSION_BOUND_OBJECT_METADATA_MISMATCH');
    const wrong=snap();wrong.mediaMime='video/mp4';
    expect((await checkAuthorizedFounderSignalMedia(req,reader(wrong))).reason)
      .toBe('VERSION_BOUND_OBJECT_METADATA_MISMATCH');
  });
  it('fails on changed bytes or stale storage metadata even with a trusted-reader claim',async()=>{
    const v=snap();const changed=Buffer.from(png);changed[27]^=1;
    v.bytes=chunks(changed);
    expect((await checkAuthorizedFounderSignalMedia(req,reader(v))).reason)
      .toBe('VERSION_BOUND_BYTE_INTEGRITY_FAILED');
    const stale=snap();stale.byteCount=png.length-1;
    expect((await checkAuthorizedFounderSignalMedia(req,reader(stale))).reason)
      .toBe('VERSION_BOUND_BYTE_INTEGRITY_FAILED');
  });
  it('denies thrown reader errors without leaking provider exceptions',async()=>{
    const r:AuthenticatedMediaReader={openAuthorizedVersion:vi.fn(async()=>{
      throw new Error('provider-secrets-do-not-log');
    })};
    const x=await checkAuthorizedFounderSignalMedia(req,r);
    expect(x.reason).toBe('AUTHORIZED_READER_ERROR');
    expect(JSON.stringify(x)).not.toContain('provider-secrets-do-not-log');
  });
});
