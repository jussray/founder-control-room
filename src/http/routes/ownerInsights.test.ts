import express from 'express';
import request from 'supertest';
import {describe,expect,it,vi,beforeEach} from 'vitest';
import {InsightsError} from '../../owner-intelligence/ownerInsights.js';

const mocks=vi.hoisted(()=>({
  google:vi.fn(), review:vi.fn(), from:vi.fn(),maybeSingle:vi.fn(),
}));
vi.mock('../middleware/requireFounder.js',()=>({
  requireFounder:(req:{get:(name:string)=>string|undefined},res:{status:(code:number)=>{json:(body:unknown)=>unknown}},next:()=>void)=>{
    if(req.get('Authorization')!=='Bearer approved-founder')return res.status(401).json({error:'Founder session required'});
    next();
  },
}));
vi.mock('../../lib/supabaseClient.js',()=>({supabase:{from:mocks.from}}));
vi.mock('../../owner-intelligence/ownerInsights.js',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('../../owner-intelligence/ownerInsights.js')>();
  return {...actual,readSearchConsole:mocks.google,reviewEvidenceWithGateway:mocks.review};
});
const {ownerInsightsRouter}=await import('./ownerInsights.js');
function app(){const instance=express();instance.use(express.json());instance.use('/owner-insights',ownerInsightsRouter);return instance;}
const data={projectSlug:'founder-control-room',claim:'Evidence for published sitemap processing and indexing',evidence:[{source:'Owner report',observation:'A read-only provider API result'}],shareEvidenceWithModel:true};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.maybeSingle.mockResolvedValue({data:{id:'project-1',slug:'founder-control-room'},error:null});
  mocks.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:mocks.maybeSingle})})});
  mocks.google.mockResolvedValue({contract:'fcr/owner-intelligence@v1',source:'GOOGLE_SEARCH_CONSOLE_API',status:'OBSERVED',pages:[],sitemaps:[]});
  mocks.review.mockResolvedValue({contract:'fcr/owner-intelligence@v1',authority:'ADVISORY_ONLY',verified:false,releaseAuthorized:false,nextGate:'verify_source',gaps:[],attackQuestions:[]});
});
describe('Owner Intelligence API authentication and provider boundaries',()=>{
  it('denies both endpoints before provider or project access when unauthenticated',async()=>{
    const get=await request(app()).get('/owner-insights/search-console');
    const post=await request(app()).post('/owner-insights/claims/review').send(data);
    expect(get.status).toBe(401);expect(post.status).toBe(401);
    expect(mocks.google).not.toHaveBeenCalled();expect(mocks.review).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();
  });
  it('returns bounded provider readback privately to an authenticated founder',async()=>{
    const result=await request(app()).get('/owner-insights/search-console').set('Authorization','Bearer approved-founder');
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toContain('no-store');
    expect(result.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(result.body.source).toBe('GOOGLE_SEARCH_CONSOLE_API');
  });
  it('does not call a model until request and project registry are valid',async()=>{
    const invalid=await request(app()).post('/owner-insights/claims/review')
      .set('Authorization','Bearer approved-founder').send({...data,shareEvidenceWithModel:false});
    expect(invalid.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.maybeSingle.mockResolvedValueOnce({data:null,error:null});
    const unknown=await request(app()).post('/owner-insights/claims/review')
      .set('Authorization','Bearer approved-founder').send(data);
    expect(unknown.status).toBe(404);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('passes only the bounded input to Gateway, never a release approval',async()=>{
    const result=await request(app()).post('/owner-insights/claims/review')
      .set('Authorization','Bearer approved-founder').send(data);
    expect(result.status).toBe(200);
    expect(result.body.authority).toBe('ADVISORY_ONLY');
    expect(result.body.releaseAuthorized).toBe(false);
    expect(mocks.review).toHaveBeenCalledTimes(1);
    expect(mocks.review.mock.calls[0]?.[0]).toMatchObject({projectSlug:data.projectSlug,shareEvidenceWithModel:true});
  });
  it('reports upstream credential failures without echoing provider secret or exceptions',async()=>{
    mocks.google.mockRejectedValueOnce(new InsightsError(503,'GSC_CREDENTIAL_NOT_CONFIGURED'));
    const get=await request(app()).get('/owner-insights/search-console').set('Authorization','Bearer approved-founder');
    expect(get.status).toBe(503);
    expect(get.body).toMatchObject({status:'BLOCKED',code:'GSC_CREDENTIAL_NOT_CONFIGURED'});
    mocks.review.mockRejectedValueOnce(new Error('sensitive mock provider details'));
    const post=await request(app()).post('/owner-insights/claims/review').set('Authorization','Bearer approved-founder').send(data);
    expect(post.status).toBe(502);
    expect(post.body.code).toBe('OWNER_INSIGHTS_UNAVAILABLE');
    expect(post.text).not.toContain('sensitive mock provider details');
  });
});
