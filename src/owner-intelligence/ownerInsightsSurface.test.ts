import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
describe('Owner Intelligence private surface and public SEO/AEO contracts',()=>{
  it('wires a real founder-protected API, not a public model relay',()=>{
    const server=read('src/http/server.ts'),router=read('src/http/routes/ownerInsights.ts');
    expect(server).toContain("app.use('/owner-insights', ownerInsightsRouter)");
    expect(router).toContain('ownerInsightsRouter.use(requireFounder)');
    expect(router).toContain("res.setHeader('Cache-Control','private, no-store')");
    expect(router).toContain("res.setHeader('X-Robots-Tag','noindex, nofollow')");
    expect(router).toContain("select('id,slug').eq('slug',input.projectSlug).maybeSingle()");
    expect(router).not.toMatch(/res\.json\(\s*req\.body\s*\)/);
  });
  it('ships the panel in Pages build, links it from authenticated FCR UI and prohibits indexing',()=>{
    const build=read('scripts/build-pages.mjs'),ui=read('public/control-room/search-evidence.html'),app=read('public/control-room/app.js');
    expect(build).toContain("'control-room/search-evidence.html'");
    expect(build).toContain("'control-room/search-evidence.js'");
    expect(app).toContain("'/control-room/search-evidence.html'");
    expect(ui).toContain('name="robots" content="noindex,nofollow"');
    expect(ui).toContain('role="status" aria-live="polite"');
    expect(ui).toContain('name="shareEvidenceWithModel" required');
    expect(ui).toContain('Google Search Console');
    expect(ui).toContain('Cloudflare AI Gateway');
    const robots=read('public/robots.txt');
    expect(robots).not.toContain('Allow: /control-room/search-evidence');
    expect(read('public/sitemap.xml')).not.toContain('/control-room/');
  });
  it('publishes valid bounded JSON-LD and canonical open graph identity without unverifiable ratings',()=>{
    const home=read('public/index.html'),sitemap=read('public/sitemap.xml');
    const match=home.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    expect(match).not.toBeNull();
    const graph=JSON.parse(match?.[1]||'{}');
    expect(graph['@context']).toBe('https://schema.org');
    expect(graph['@graph'].map((x:{'@type':string})=>x['@type'])).toEqual(['Organization','WebSite']);
    expect(home).toContain('<meta property="og:url" content="https://www.foundercontrolroom.org/" />');
    expect(home).toContain('<meta name="twitter:card" content="summary" />');
    expect(home).not.toContain('"aggregateRating"');
    expect(sitemap).toContain('<lastmod>2026-11-02</lastmod>');
  });
});
