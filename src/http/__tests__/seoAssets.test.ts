import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('public founder discovery assets', () => {
  it('keeps Juss Rayy directly indexable and connected to public identity surfaces', () => {
    const profile = read('public/juss-rayy/index.html');

    expect(profile).toContain('<meta name="robots" content="index,follow"');
    expect(profile).toContain('https://foundercontrolroom.org/juss-rayy');
    expect(profile).toContain('itemtype="https://schema.org/Person"');
    expect(profile).toContain('itemprop="sameAs" href="https://github.com/jussray"');
    expect(profile).toContain('itemprop="sameAs" href="https://www.linkedin.com/in/juss-rayy-13ba691a1"');
    expect(profile).toContain('Juss Rayy');
  });

  it('publishes an explicit crawler map for the founder profile and public work', () => {
    const robots = read('public/robots.txt');
    const sitemap = read('public/sitemap.xml');

    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://www.foundercontrolroom.org/sitemap.xml');

    expect(sitemap).toContain('<loc>https://www.foundercontrolroom.org/</loc>');
    expect(sitemap).toContain('<loc>https://www.foundercontrolroom.org/juss-rayy/</loc>');
    expect(sitemap).toContain('<loc>https://www.foundercontrolroom.org/guardrails</loc>');
  });

  it('publishes a bounded AI-readable map of the same public work', () => {
    const llms = read('public/llms.txt');

    expect(llms).toContain('Canonical founder profile: https://www.foundercontrolroom.org/juss-rayy/');
    expect(llms).toContain('Founder Control Room');
    expect(llms).toContain('Chief AI');
    expect(llms).toContain('Se’kret Bip');
    expect(llms).toContain('PromptOS');
    expect(llms).toContain('StoryEngine / L99');
    expect(llms).toContain('Goalfix');
    expect(llms).toContain('A passing test is not automatically production proof');
  });
});
