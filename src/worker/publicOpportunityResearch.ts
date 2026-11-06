/** Public-only research leads. No tenant data, private connectors, outbound actions or market scoring. */
export const PUBLIC_OPPORTUNITY_RESEARCH_PATH = '/public/opportunity-research/v1';
export const PUBLIC_OPPORTUNITY_RESEARCH_CONTRACT = 'jussco/public-opportunity-signals@v1';

const ORIGINS = new Set(['https://jussco.company', 'https://www.jussco.company']);
const TOPICS = [
  { id: 'ai-discovery-audits', title: 'AI search discovery audit', products: ['Truth Compass', 'Juss & Co'], query: 'AI search visibility brands AEO GEO business demand' },
  { id: 'workflow-proof-repair', title: 'AI workflow proof and repair', products: ['Founder Control Room', 'PromptOS'], query: 'small business AI agent reliability workflow audit' },
  { id: 'shopping-discovery-checks', title: 'AI shopping catalog accuracy', products: ['JBH', 'Truth Weaver'], query: 'AI shopping product discovery retailer data accuracy' },
] as const;

function extractField(xml: string, tag: string): string {
  const start = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(xml);
  if (!start) return '';
  const value = start[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .replace(/<[^>]+>/g, '').trim();
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").slice(0, 350);
}

/** Headlines are leads to investigate, never proof of verified demand or low competition. */
export function parsePublicOpportunityRss(xml: string, now: Date = new Date()) {
  const matches = xml.slice(0, 400_000).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const seen = new Set<string>();
  return matches.flatMap((item) => {
    const title = extractField(item, 'title');
    const link = extractField(item, 'link');
    const pubDate = extractField(item, 'pubDate');
    let url: URL;
    try { url = new URL(link); } catch { return []; }
    if (url.protocol !== 'https:' || title.length < 8 || seen.has(url.href)) return [];
    const time = pubDate ? Date.parse(pubDate) : NaN;
    const age = now.getTime() - time;
    if (Number.isFinite(time) && (age < 0 || age > 90 * 86400000)) return [];
    seen.add(url.href);
    return [{
      title, url: url.href, publishedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
      evidenceState: 'unverified' as const,
      source: 'Google News RSS (third-party aggregation)' as const,
    }];
  }).slice(0, 3);
}

function json(data: unknown, status: number, origin: string | null): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=900' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  });
  if (origin && ORIGINS.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(data), { status, headers });
}

export async function handlePublicOpportunityResearch(
  request: Request,
  fetcher: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, origin);
  const opportunities = await Promise.all(TOPICS.map(async (topic) => {
    const url = 'https://news.google.com/rss/search?q=' +
      encodeURIComponent(topic.query) + '&hl=en-US&gl=US&ceid=US:en';
    try {
      const response = await fetcher(url, {
        headers: { Accept: 'application/rss+xml, application/xml' },
        signal: AbortSignal.timeout(6500),
      });
      if (!response.ok) throw new Error('upstream_non_2xx');
      const xml = (await response.text()).slice(0, 400_000);
      return { id: topic.id, title: topic.title, products: [...topic.products],
        viabilityScore: null, status: 'unverified_signals' as const,
        sources: parsePublicOpportunityRss(xml, now), error: null };
    } catch {
      return { id: topic.id, title: topic.title, products: [...topic.products],
        viabilityScore: null, status: 'source_unavailable' as const,
        sources: [], error: 'public_feed_unavailable' };
    }
  }));
  const available = opportunities.some((item) => item.sources.length > 0);
  return json({
    contract: PUBLIC_OPPORTUNITY_RESEARCH_CONTRACT,
    generatedAt: now.toISOString(),
    researchStatus: available ? 'unverified_public_signals' : 'source_unavailable',
    statement: 'News headlines are research leads, not verified market demand, low competition or product readiness.',
    opportunities,
    authority: { advisoryOnly: true, authorizesOutreach: false, authorizesSpend: false, authorizesDeploy: false },
  }, available ? 200 : 503, origin);
}
