import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function groupFor(robots: string, agent: string) {
  const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = robots.match(new RegExp(`User-agent: ${escaped}\\n([\\s\\S]*?)(?=\\nUser-agent: |\\nSitemap: |$)`));
  expect(match, `missing robots group for ${agent}`).toBeTruthy();
  return match?.[1] ?? '';
}

const boundedPublicPaths = [
  '/$',
  '/juss-rayy/',
  '/work.html$',
  '/guardrails',
  '/mom8/',
  '/robots.txt$',
  '/sitemap.xml$',
  '/llms.txt$',
  '/crawlers.json$',
];

describe('public founder discovery assets', () => {
  it('keeps Juss Rayy directly indexable and normalizes the deployed canonical origin', () => {
    const profile = read('public/juss-rayy/index.html');
    const build = read('scripts/build-pages.mjs');

    expect(profile).toContain('<meta name="robots" content="index,follow"');
    expect(profile).toContain('itemtype="https://schema.org/Person"');
    expect(profile).toContain('itemprop="sameAs" href="https://github.com/jussray"');
    expect(profile).toContain('itemprop="sameAs" href="https://www.linkedin.com/in/juss-rayy-13ba691a1"');
    expect(profile).toContain('Juss Rayy');
    expect(build).toContain("'https://www.foundercontrolroom.org/juss-rayy/'");
    expect(build).toContain('dateModified');
  });

  it('publishes an explicit bounded crawler map while denying training crawlers', () => {
    const robots = read('public/robots.txt');
    const sitemap = read('public/sitemap.xml');

    for (const agent of ['GPTBot', 'ClaudeBot', 'Google-Extended']) {
      const group = groupFor(robots, agent);
      expect(group).toMatch(/^Disallow: \/$/m);
      expect(group).not.toMatch(/^Allow:/m);
    }

    for (const agent of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'Googlebot', '*']) {
      const group = groupFor(robots, agent);
      expect(group).toMatch(/^Disallow: \/$/m);
      for (const path of boundedPublicPaths) expect(group).toContain(`Allow: ${path}`);
    }

    expect(robots).toContain('Sitemap: https://www.foundercontrolroom.org/sitemap.xml');
    expect(sitemap).toContain('<loc>https://www.foundercontrolroom.org/</loc>');
    expect(sitemap).toContain('<loc>https://www.foundercontrolroom.org/juss-rayy/</loc>');
    expect(sitemap).toContain('<loc>https://www.foundercontrolroom.org/work.html</loc>');
    expect(sitemap).toContain('<loc>https://www.foundercontrolroom.org/guardrails</loc>');
    expect(sitemap).toContain('<loc>https://www.foundercontrolroom.org/mom8/</loc>');
  });

  it('publishes a usable public work directory without pretending source-only projects are live products', () => {
    const work = read('public/work.html');
    const build = read('scripts/build-pages.mjs');

    expect(work).toContain('<meta name="robots" content="index,follow"');
    expect(work).toContain('<link rel="canonical" href="https://www.foundercontrolroom.org/work.html"');
    expect(work).toContain('Work you can use. Proof you can inspect.');
    expect(work).toContain('href="https://www.foundercontrolroom.org/"');
    expect(work).toContain('href="https://sekretbip.net/"');
    expect(work).toContain('href="https://github.com/jussray/chief-ai-machine"');
    expect(work).toContain('href="https://github.com/jussray/promptos"');
    expect(work).toContain('href="https://github.com/jussray/StoryEngine"');
    expect(work).toContain('STORE PATH UNDER VERIFICATION');
    expect(work).not.toContain('8qp1z2-az.myshopify.com');
    expect(build).toContain("'work.html'");
  });

  it('publishes bounded machine-readable AI access, attribution, and work routing policy', () => {
    const llms = read('public/llms.txt');
    const crawlers = JSON.parse(read('public/crawlers.json'));
    const headers = read('public/_headers');

    expect(llms).toContain('Canonical founder profile: https://www.foundercontrolroom.org/juss-rayy/');
    expect(llms).toContain('Public work/use directory: https://www.foundercontrolroom.org/work.html');
    expect(llms).toContain('Founder Control Room');
    expect(llms).toContain('Chief AI');
    expect(llms).toContain('Se’kret Bip');
    expect(llms).toContain('PromptOS');
    expect(llms).toContain('StoryEngine / L99');
    expect(llms).toContain('Juss Beautiful Hair');
    expect(llms).toContain('Untold Stories');
    expect(llms).toContain('A passing test is not automatically production proof');

    expect(crawlers.schema).toBe('juss/ai-crawler-contract@v1');
    expect(crawlers.policy.search_discovery).toBe('allow_bounded_public_paths');
    expect(crawlers.policy.user_directed_retrieval).toBe('allow_bounded_public_paths');
    expect(crawlers.policy.model_training).toBe('deny');
    expect(crawlers.policy.write_or_action_authority).toBe('none');
    expect(crawlers.bots.GPTBot).toBe('deny');
    expect(crawlers.bots['OAI-SearchBot']).toBe('allow_bounded_public_paths');
    expect(crawlers.public_paths).toContain('/work.html');
    expect(crawlers.public_truth.work_directory).toBe('https://www.foundercontrolroom.org/work.html');
    expect(crawlers.attribution.requested).toBe(true);
    expect(headers).toContain('Content-Signal: ai-train=no, search=yes, ai-input=no');
    expect(headers).toContain('/crawlers.json');
  });
});
