import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const publicRoot = fileURLToPath(new URL('../../../public/', import.meta.url));
const read = (path: string) => readFileSync(join(publicRoot, path), 'utf8');
const routes = ['about', 'services', 'faq', 'support', 'delivery'] as const;

describe('FCR public information pages', () => {
  it.each(routes)('makes /%s.html a distinct accessible, canonical static page', (route) => {
    const html = read(`${route}.html`);
    expect(html).toContain('<main id="main">');
    expect(html).toContain('<nav aria-label="Information pages">');
    expect(html).toContain(`https://www.foundercontrolroom.org/${route}.html`);
    expect(html).toContain('/assets/fcr-information.css');
    expect(html).not.toMatch(/<form\b/i);
  });

  it('links to every public information page from the home footer', () => {
    const home = read('index.html');
    expect(home).toContain('.foot nav { display: flex; flex-wrap: wrap; gap: .5rem 1rem; }');
    for (const route of routes) {
      expect(home).toContain(`href="/${route}.html"`);
    }
  });

  it('lists every public information page in the sitemap', () => {
    const sitemap = read('sitemap.xml');
    for (const route of routes) {
      expect(sitemap).toContain(`https://www.foundercontrolroom.org/${route}.html`);
    }
  });

  it('keeps support address and delivery uncertainty explicit', () => {
    expect(read('support.html')).toContain('support@foundercontrolroom.org');
    expect(read('delivery.html')).toContain('no universal promise');
    expect(read('services.html')).toContain('require separate authorization');
  });
});
