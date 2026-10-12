import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCrawlerSurface, parseHeadFacts } from './external-site-crawler-surface.mjs';

const PAGE = `<!doctype html><html><head>
<link rel="canonical" href="https://example.test/">
<meta name="description" content="A studio page.">
<meta property="og:title" content="Example">
<meta name="robots" content="index,follow">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example"}</script>
<script type="application/ld+json">{ not json</script>
</head><body></body></html>`;

test('extracts canonical, description, og, robots meta and JSON-LD types', () => {
  const h = parseHeadFacts(PAGE);
  assert.equal(h.canonical, 'https://example.test/');
  assert.equal(h.metaDescription, 'A studio page.');
  assert.equal(h.robotsMeta, 'index,follow');
  assert.equal(h.ogTitleCount, 1);
  assert.deepEqual(h.jsonLd, { blocks: 2, types: ['Organization'], parseErrors: 1 });
});

test('reports absent head facts as null, not as passing', () => {
  const h = parseHeadFacts('<html><head></head></html>');
  assert.equal(h.canonical, null);
  assert.equal(h.metaDescription, null);
  assert.deepEqual(h.jsonLd, { blocks: 0, types: [], parseErrors: 0 });
});

test('file summaries record status, bytes and first line; missing files stay unknown', () => {
  const s = parseCrawlerSurface({
    origin: 'https://example.test',
    html: PAGE,
    files: {
      robots: { status: 200, body: '# policy\nUser-agent: *\n' },
      sitemap: { status: 404, body: '<html>nope</html>' },
      llms: { error: 'timeout' },
    },
  });
  assert.equal(s.files.robots.status, 200);
  assert.equal(s.files.robots.firstLine, '# policy');
  assert.equal(s.files.sitemap.status, 404);
  assert.equal(s.files.llms.status, null);
  assert.equal(s.files.llms.error, 'timeout');
  assert.equal(s.canonicalMatchesOrigin, true);
});

test('canonical host mismatch is flagged, not hidden', () => {
  const s = parseCrawlerSurface({ origin: 'https://www.example.test', html: PAGE });
  assert.equal(s.canonicalMatchesOrigin, false);
});
