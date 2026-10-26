import { describe, expect, it } from 'vitest';
import { planFounderSignalCampaign } from '../founderSignalCampaignPlanner.js';
const SHA = 'a'.repeat(40);
function draft(overrides: Record<string, unknown> = {}) {
  return {
    source: { repository: 'jussray/founder-control-room', commitSha: SHA,
      proofUrl: 'https://github.com/jussray/founder-control-room/commit/' + SHA, visibility: 'public' },
    strategy: {
      intent: 'proof-update', audience: 'Builders learning about practical automation',
      observation: 'An automated post should never hide what remains untested.',
      fact: 'An evidence gate now checks whether a social draft matches its source record.',
      audienceValue: 'Builders can inspect what the system actually checked.',
      truthBoundary: 'Local checks do not prove provider delivery or customer impact.',
      callToAction: 'What would you want to verify next?',
      thesis: 'Proof should come before reach',
    },
    topics: ['BuildInPublic', 'FounderTech', 'ProofFirst', 'ResponsibleAI', 'DevTools'],
    platforms: ['linkedin', 'instagram', 'youtube', 'x', 'facebook'],
    ...overrides,
  };
}
describe('Founder Signal Engine native campaign planner', () => {
  it('makes distinct native review copy with relevant hashtags, media direction and evidence boundary', () => {
    const x=planFounderSignalCampaign(draft());
    expect(x.contract).toBe('fcr/founder-signal-campaign@v1');
    expect(x.evidenceClass).toBe('USER_SUPPLIED_UNVERIFIED');
    expect(x.authority.canPublish).toBe(false);
    expect(x.authority.canCreateBufferDraft).toBe(false);
    expect(x.variants).toHaveLength(5);
    const linkedin=x.variants.find(v=>v.platform==='linkedin')!;
    const instagram=x.variants.find(v=>v.platform==='instagram')!;
    const video=x.variants.find(v=>v.platform==='youtube')!;
    expect(linkedin.hashtags).toHaveLength(5);
    expect(linkedin.copy).not.toEqual(instagram.copy);
    expect(linkedin.copy).toContain('What still needs proving');
    expect(instagram.media.kind).toBe('video');
    expect(video.media.kind).toBe('video');
    expect(video.media.state).toBe('NOT_RENDERED');
    expect(x.analyticsPlan).toContain('48h comparable platform-native performance');
    expect(x.continuation.workflow).toContain('HubSpot/FCR receipt');
    expect(x.continuation.continuityFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it('never mistakes repeated historic thesis for a fresh social concept', () => {
    const x=planFounderSignalCampaign(draft({recentPosts: [
      { thesis: 'PROOF should come before REACH!', publicPostUrl: 'https://www.linkedin.com/posts/synthetic' },
    ]}));
    expect(x.operationalState).toBe('HOLD_REPETITIVE_ANGLE');
    expect(x.variants.every(v=>v.status==='HOLD_FRESHNESS')).toBe(true);
  });
  it('refuses private proof, arbitrary external proof and credentials', () => {
    expect(()=>planFounderSignalCampaign(draft({source:{...draft().source,visibility:'private'}}))).toThrow(/public source/);
    expect(()=>planFounderSignalCampaign(draft({source:{...draft().source,proofUrl:'https://example.org/proof'}}))).toThrow(/GitHub proof/);
    expect(()=>planFounderSignalCampaign(draft({strategy:{...draft().strategy,fact:'Bearer sk-this-is-forbidden'}}))).toThrow(/credential/);
  });
  it('rejects personal contact exposure, spam hashtags and duplicate platforms', () => {
    expect(()=>planFounderSignalCampaign(draft({strategy:{...draft().strategy,observation:'Email a.person@example.com'}}))).toThrow(/contact data/);
    expect(()=>planFounderSignalCampaign(draft({topics:['clickme','clickme','FakeUsers']}))).toThrow(/distinct/);
    expect(()=>planFounderSignalCampaign(draft({platforms:['linkedin','linkedin']}))).toThrow(/distinct supported/);
  });
  it('denies text-only for mandatory-media platforms', () => {
    expect(()=>planFounderSignalCampaign(draft({mediaPreference:'none'}))).toThrow(/requires media/);
    const x=planFounderSignalCampaign(draft({platforms:['linkedin'],mediaPreference:'none'}));
    expect(x.variants[0].media.kind).toBe('text-only');
    expect(x.variants[0].status).toBe('FOUNDER_REVIEW_ONLY');
  });
  it('never asserts a real prior posting pattern without source URL', () => {
    expect(()=>planFounderSignalCampaign(draft({recentPosts:[{thesis:'similar'}]}))).toThrow(/public post URL/);
    const x=planFounderSignalCampaign(draft());
    expect(x.authoringGuidance.provenance).toMatch(/NOT a verified analysis/);
  });
  it('holds copy that exceeds a native channel safe character limit rather than truncating proof', () => {
    const x=planFounderSignalCampaign(draft());
    const twitter=x.variants.find(v=>v.platform==='x')!;
    expect(twitter.charCount).toBe(twitter.copy.length);
    if(twitter.charCount>270) expect(twitter.status).toBe('HOLD_COPY_LIMIT');
    expect(twitter.copy).toContain('https://github.com/jussray/founder-control-room/commit/');
  });
});
