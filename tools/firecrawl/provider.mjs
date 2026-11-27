// Server-side only. The caller must enforce authenticated authority, public-data
// consent and a durable credit budget before supplying approved: true.
// Never pass raw case records, private repository content or customer data.
const ENDPOINT = 'https://api.firecrawl.dev/v2/search';

function candidateUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !host.includes('.') || host.endsWith('.') || host.endsWith('.local') ||
        host.endsWith('.internal') || /^[0-9.]+$/.test(host) ||
        host === 'localhost' || host.endsWith('.localhost')) return null;
    // Drop query and fragment to avoid preserving credentials or tracking IDs.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch { return null; }
}

function text(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

export async function searchPublicEvidence(input, config, fetcher = globalThis.fetch) {
  if (config?.enabled !== true || typeof config.apiKey !== 'string' || !config.apiKey.trim()) {
    throw new Error('FIRECRAWL_DISABLED');
  }
  if (input?.approved !== true) throw new Error('FIRECRAWL_APPROVAL_REQUIRED');
  const query = typeof input.publicQuery === 'string' ? input.publicQuery.trim() : '';
  const limit = input.limit ?? 3;
  // Defense in depth only; not a complete personal-data detector.
  if (!query || query.length > 500 || /https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{3}-\d{2}-\d{4}\b|\b(?:api[_ -]?key|password|secret|token)\s*[:=]/i.test(query) ||
      !Number.isInteger(limit) || limit < 1 || limit > 5) {
    throw new Error('FIRECRAWL_INVALID_INPUT');
  }
  let response;
  try {
    response = await fetcher(ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ query, limit, safe: true, sources: [{type:'web'}], timeout: 12000 })
    });
  } catch { throw new Error('FIRECRAWL_REQUEST_FAILED'); }
  if (!response?.ok) {
    const status = Number.isInteger(response?.status) ? response.status : 0;
    throw new Error('FIRECRAWL_HTTP_' + status);
  }
  let payload;
  try { payload = await response.json(); } catch { throw new Error('FIRECRAWL_INVALID_RESPONSE'); }
  if (payload?.success !== true || !Array.isArray(payload.data?.web)) {
    throw new Error('FIRECRAWL_INVALID_RESPONSE');
  }
  const retrievedAt = new Date().toISOString();
  const sources = [];
  const seen = new Set();
  for (const item of payload.data.web.slice(0, 100)) {
    const url = candidateUrl(item?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      provider: 'firecrawl', url, title: text(item.title, 300),
      excerpt: text(item.description, 1000), retrievedAt,
      trust: 'UNTRUSTED', verificationState: 'UNKNOWN'
    });
    if (sources.length >= limit) break;
  }
  return { provider: 'firecrawl', retrievedAt, authorizing: false, sources };
}
