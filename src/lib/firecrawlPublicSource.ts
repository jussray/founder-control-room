/** Server-only, public-source observation. No action or publication authority. */
const TARGETS = {
  fcr: ['https://foundercontrolroom.org/'],
  studio: ['https://jussco.company/', 'https://www.jussco.company/'],
  truthweaverShop: ['https://truthweaver.jussco.company/shop'],
} as const;
const ENDPOINT = 'https://api.firecrawl.dev/v2/scrape';
const MAX_RESPONSE = 524288;
const MAX_MARKDOWN = 200000;
const record = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null;
const limits = { sourceClaimVerified: false, deploymentVerified: false, proofOfBusinessOutcome: false,
  authorizesDraft: false, authorizesPublish: false, authorizesExecution: false, providerConfigurationChanged: false } as const;
const hold = (reason: string) => ({status: 'HOLD_UNVERIFIED' as const, reason, ...limits});
export interface FirecrawlDependencies {
  apiKey?: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
}
async function readBounded(response: Response): Promise<unknown> {
  if (!/^application\/json\b/i.test(response.headers.get('content-type') ?? '') || !response.body) throw Error();
  if (Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE) { await response.body.cancel(); throw Error(); }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let bytes = 0, body = '';
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE) { await reader.cancel(); throw Error(); }
      body += decoder.decode(value,{stream:true});
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } finally { reader.releaseLock(); }
}
export async function observeFirecrawlPublicSource(target: unknown, deps: FirecrawlDependencies = {}) {
  if (typeof target !== 'string' || !Object.hasOwn(TARGETS,target)) return hold('UNKNOWN_PUBLIC_TARGET');
  if (!deps.apiKey?.trim()) return hold('MISSING_SERVER_CREDENTIAL');
  const urls: readonly string[] = TARGETS[target as keyof typeof TARGETS];
  const [url] = urls;
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  try {
    const response = await (deps.fetchFn ?? fetch)(ENDPOINT, {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(25000),
      headers:{Authorization:`Bearer ${deps.apiKey}`, 'Content-Type':'application/json'},
      body:JSON.stringify({url,formats:['markdown'],maxAge:0,storeInCache:false,redactPII:true,timeout:20000}),
    });
    if (!response.ok) { await response.body?.cancel(); return hold('PROVIDER_HTTP_FAILURE'); }
    const result = record(await readBounded(response));
    const data = record(result?.data), meta = record(data?.metadata);
    if (result?.success !== true || !meta || meta.statusCode !== 200 || meta.error) return hold('TARGET_NOT_OBSERVED');
    if (typeof meta.sourceURL !== 'string' || !urls.includes(meta.sourceURL) || typeof meta.url !== 'string' || !urls.includes(meta.url)) return hold('UNEXPECTED_SOURCE_URL');
    const markdown = data?.markdown;
    if (typeof markdown !== 'string' || !markdown.trim()) return hold('INVALID_CONTENT');
    const encoded = new TextEncoder().encode(markdown);
    if (encoded.byteLength > MAX_MARKDOWN) return hold('CONTENT_TOO_LARGE');
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoded)), n=>n.toString(16).padStart(2,'0')).join('');
    return { status:'OBSERVED_PUBLIC_PAGE' as const, markdown, receipt:{
      contract:'fcr/firecrawl-public-source-observation@v1', evidenceClass:'PROVIDER_RETURNED_PUBLIC_CONTENT',
      provider:'firecrawl', target, requestedUrl:url, sourceUrl:meta.url, targetStatus:200,
      startedAt, observedAt:now().toISOString(), sha256,
      creditsUsed:typeof meta.creditsUsed === 'number' && Number.isFinite(meta.creditsUsed) && meta.creditsUsed >= 0 ? meta.creditsUsed : null,
      ...limits,
    }};
  } catch { return hold('PROVIDER_RESPONSE_UNVERIFIED'); }
}
