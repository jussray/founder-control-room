// Pure analysis of a public page's crawler surface. No network, no browser.
// Input is data the snapshot already fetched; output is evidence, not a score.

const EXPECTED_FILES = ['robots', 'sitemap', 'llms'];

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
}

export function parseHeadFacts(html = '') {
  const canonicalTag = (html.match(/<link\b[^>]*>/gi) || []).find((t) => /rel\s*=\s*["']canonical["']/i.test(t));
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const description = metaTags.find((t) => /name\s*=\s*["']description["']/i.test(t));
  const robotsMeta = metaTags.find((t) => /name\s*=\s*["']robots["']/i.test(t));
  const ldBlocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const ldTypes = [];
  let ldParseErrors = 0;
  for (const [, body] of ldBlocks) {
    try {
      const data = JSON.parse(body.trim());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) ldTypes.push(String(item['@type'] ?? 'unknown'));
    } catch {
      ldParseErrors += 1;
    }
  }
  return {
    canonical: canonicalTag ? attr(canonicalTag, 'href') : null,
    metaDescription: description ? attr(description, 'content') : null,
    robotsMeta: robotsMeta ? attr(robotsMeta, 'content') : null,
    ogTitleCount: (html.match(/property\s*=\s*["']og:title["']/gi) || []).length,
    jsonLd: { blocks: ldBlocks.length, types: ldTypes, parseErrors: ldParseErrors },
  };
}

export function summarizeFile(file) {
  if (!file || file.error) return { status: null, error: file?.error ?? 'not fetched' };
  const body = typeof file.body === 'string' ? file.body : '';
  return {
    status: file.status ?? null,
    bytes: Buffer.byteLength(body, 'utf8'),
    firstLine: body.split('\n').find((l) => l.trim()) ?? '',
  };
}

export function parseCrawlerSurface({ origin, html = '', files = {} }) {
  const surface = { origin, head: parseHeadFacts(html), files: {} };
  for (const name of EXPECTED_FILES) surface.files[name] = summarizeFile(files[name]);
  const canonicalHost = (() => { try { return new URL(surface.head.canonical ?? '').host; } catch { return null; } })();
  surface.canonicalMatchesOrigin = canonicalHost === null ? null : canonicalHost === new URL(origin).host;
  return surface;
}
