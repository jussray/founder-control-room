import { describe, expect, it } from 'vitest';
import { handlePublicOpportunityResearch, parsePublicOpportunityRss } from '../publicOpportunityResearch.js';

const when = new Date('2026-11-06T19:00:00.000Z');
const feed = '<?xml version="1.0"?><rss><channel>' +
  '<item><title><![CDATA[AI visibility market research &amp; audit trends]]></title>' +
  '<link>https://news.google.com/articles/123</link><pubDate>Thu, 05 Nov 2026 18:00:00 GMT</pubDate></item>' +
  '<item><title>Malicious</title><link>javascript:alert(1)</link></item>' +
  '<item><title>Stale headline</title><link>https://example.com/old</link><pubDate>Thu, 01 Jan 2025 00:00:00 GMT</pubDate></item>' +
  '</channel></rss>';

describe('Juss & Co public opportunity research', () => {
  it('accepts only safe current public links and never upgrades news to verified market evidence', () => {
    const leads = parsePublicOpportunityRss(feed, when);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      title: 'AI visibility market research & audit trends',
      url: 'https://news.google.com/articles/123',
      evidenceState: 'unverified',
    });
  });

  it('returns three public research directions with unscored research leads and no execution rights', async () => {
    const fetcher = (async () => new Response(feed, {status:200})) as typeof fetch;
    const res = await handlePublicOpportunityResearch(
      new Request('https://api.foundercontrolroom.org/public/opportunity-research/v1', {
        headers: { Origin: 'https://jussco.company' },
      }), fetcher, when);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jussco.company');
    const body = await res.json() as any;
    expect(body.contract).toBe('jussco/public-opportunity-signals@v1');
    expect(body.opportunities).toHaveLength(3);
    expect(body.opportunities.every((item: any) =>
      item.viabilityScore === null && item.sources[0]?.evidenceState === 'unverified')).toBe(true);
    expect(body.authority).toMatchObject({
      advisoryOnly: true, authorizesOutreach: false, authorizesSpend: false, authorizesDeploy: false,
    });
  });

  it('does not send requests for disallowed methods or expose CORS to other origins', async () => {
    const fail = (async () => { throw new Error('must not fetch'); }) as typeof fetch;
    const res = await handlePublicOpportunityResearch(
      new Request('https://api.foundercontrolroom.org/public/opportunity-research/v1', {
        method: 'POST', headers: { Origin: 'https://other.example' },
      }), fail, when);
    expect(res.status).toBe(405);
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('fails closed when all public sources are unavailable', async () => {
    const fail = (async () => { throw new Error('upstream failed'); }) as typeof fetch;
    const res = await handlePublicOpportunityResearch(
      new Request('https://api.foundercontrolroom.org/public/opportunity-research/v1'), fail, when);
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.researchStatus).toBe('source_unavailable');
    expect(body.opportunities.every((item: any) => item.viabilityScore === null && item.sources.length === 0)).toBe(true);
  });
});
