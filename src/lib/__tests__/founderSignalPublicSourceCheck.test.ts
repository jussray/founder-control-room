import { describe, expect, it, vi } from 'vitest';
import { verifyFounderSignalPublicSource } from '../founderSignalPublicSourceCheck.js';

const SHA = 'a'.repeat(40);
const REPO = 'jussray/founder-control-room';
const URL = 'https://github.com/' + REPO + '/commit/' + SHA;
const input = { repository: REPO, commitSha: SHA, proofUrl: URL };
const now = () => new Date('2026-10-26T15:00:00Z');
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
function mock(returns: Array<Response | Error>) {
  let index = 0;
  const fetchFn = vi.fn(async () => {
    const item=returns[index++];
    if (item instanceof Error) throw item;
    if (!item) throw new Error('Unexpected public GitHub request');
    return item;
  }) as unknown as typeof fetch;
  return { fetchFn, count: () => index };
}
function allowed() {
  return mock([
    json({ full_name: REPO, private: false }),
    json({ sha: SHA, html_url: URL }),
  ]);
}

describe('Founder Signal Engine immutable public source readback', () => {
  it('verifies only existence of a public GitHub exact commit and grants no other proof', async () => {
    const m=allowed();
    const r=await verifyFounderSignalPublicSource(input, {fetchFn:m.fetchFn,now});
    expect(r.status).toBe('VERIFIED_PUBLIC_GITHUB_COMMIT');
    expect(r.evidenceClass).toBe('LIVE_PUBLIC_GITHUB_READBACK');
    expect(r.observedAt).toBe('2026-10-26T15:00:00.000Z');
    expect(r.repoPublicVerified).toBe(true);
    expect(r.commitExistsVerified).toBe(true);
    expect(r.sourceClaimVerified).toBe(false);
    expect(r.deploymentVerified).toBe(false);
    expect(r.proofOfBusinessOutcome).toBe(false);
    expect(r.authorizesDraft).toBe(false);
    expect(r.authorizesPublish).toBe(false);
    expect(m.fetchFn).toHaveBeenCalledTimes(2);
    for(const args of (m.fetchFn as ReturnType<typeof vi.fn>).mock.calls) {
      const [u,options] = args as unknown as [string, RequestInit];
      expect(u).toMatch(/^https:\/\/api\.github\.com\/repos\/jussray\/founder-control-room/);
      expect(options.method).toBe('GET');
      expect(options.redirect).toBe('error');
      expect(JSON.stringify(options)).not.toContain('Authorization');
    }
  });
  it('rejects caller-controlled URLs without network calls', async () => {
    const m=allowed();
    const r=await verifyFounderSignalPublicSource({...input,proofUrl:'https://github.com/other/repo/commit/'+SHA},
      {fetchFn:m.fetchFn,now});
    expect(r.status).toBe('HOLD_UNVERIFIED');
    expect(r.reason).toBe('PROOF_LINK_MUST_MATCH_EXACT_COMMIT');
    expect(m.fetchFn).not.toHaveBeenCalled();
  });
  it('rejects unowned repositories, invalid SHA and caller-injected extra metadata', async () => {
    const m=allowed();
    for (const value of [
      {...input,repository:'anotherorg/public'},
      {...input,commitSha:'../branches/main'},
      {...input,verified:true},
    ]) {
      const r=await verifyFounderSignalPublicSource(value,{fetchFn:m.fetchFn,now});
      expect(r.status).toBe('HOLD_UNVERIFIED');
    }
    expect(m.fetchFn).not.toHaveBeenCalled();
  });
  it('never treats a private or mismatched repository as public evidence', async () => {
    for(const fake of [
      {full_name:REPO,private:true},
      {full_name:'someone-else/founder-control-room',private:false},
      {full_name:REPO},
    ]) {
      const m=mock([json(fake)]);
      const r=await verifyFounderSignalPublicSource(input,{fetchFn:m.fetchFn,now});
      expect(r.status).toBe('HOLD_UNVERIFIED');
      expect(r.repoPublicVerified).toBe(false);
      expect(m.fetchFn).toHaveBeenCalledTimes(1);
    }
  });
  it('requires exact commit SHA and returned canonical public HTML link', async () => {
    for(const commit of [
      {sha:'b'.repeat(40),html_url:URL},
      {sha:SHA,html_url:'https://example.org/commit/'+SHA},
      {sha:SHA},
    ]) {
      const m=mock([json({full_name:REPO,private:false}),json(commit)]);
      const r=await verifyFounderSignalPublicSource(input,{fetchFn:m.fetchFn,now});
      expect(r.status).toBe('HOLD_UNVERIFIED');
      expect(r.reason).toBe('EXACT_COMMIT_READBACK_NOT_VERIFIED');
    }
  });
  it('holds GitHub rate limits, unavailable API, malformed JSON and wrong content types', async () => {
    const broken = [
      json({message:'API rate limit exceeded'},403),
      new Error('network down'),
      new Response('<html>not-json</html>',{headers:{'content-type':'text/html'}}),
      new Response('not json',{headers:{'content-type':'application/json'}}),
    ];
    for(const first of broken) {
      const m=mock([first]);
      const r=await verifyFounderSignalPublicSource(input,{fetchFn:m.fetchFn,now});
      expect(r.status).toBe('HOLD_UNVERIFIED');
      expect(r.reason).toBe('PUBLIC_REPOSITORY_READBACK_NOT_VERIFIED');
    }
  });
  it('holds oversized payloads and no-content-type responses', async () => {
    const m=mock([json({full_name:REPO,private:false},200,{'content-length':'65537'})]);
    const r=await verifyFounderSignalPublicSource(input,{fetchFn:m.fetchFn,now});
    expect(r.status).toBe('HOLD_UNVERIFIED');
    const n=mock([new Response('{}',{status:200})]);
    const v=await verifyFounderSignalPublicSource(input,{fetchFn:n.fetchFn,now});
    expect(v.status).toBe('HOLD_UNVERIFIED');
  });
});
