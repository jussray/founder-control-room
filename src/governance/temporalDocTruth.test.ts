import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const socialPolicy = read('docs/founder-signal-engine/social-campaign-policy-v1.md');
const readme = read('README.md');
const mergeAuthority = read('docs/FOUNDER_MERGE_AUTHORITY.md');
const globalAi = read('GLOBAL_AI.md');
const chatgpt = read('CHATGPT.md');
const launchLoop = read('.ai/skills/juss-flow-launch-loop/SKILL.md');
const truthDecay = read('docs/TRUTH_DECAY_AUDIT.md');
const cloudflareTargets = read('docs/deployment/CLOUDFLARE_WORKER_TARGETS.md');
const ci = read('.github/workflows/ci.yml');
const documentationWorkflow = read('.github/workflows/documentation-truth.yml');

const FORBIDDEN_REPOSITORY_WIDE_STALE_CLAIMS = [
  'Status: `CLASSIFICATION_ONLY_NO_GENERATION_NO_PROVIDER_CALLS`',
  'No Perplexity, Buffer, or Zapier network calls',
  'No live content generation',
  'Until then, this module is available',
] as const;

const REQUIRED_TEMPORAL_BOUNDARIES = [
  'Status: `MODULE_SCOPE_CLASSIFICATION_ONLY`',
  '## Module boundary — not repository-wide provider truth',
  'That is a module boundary only; it is not evidence that Founder Control Room as a whole lacks those integrations.',
  'it must not be generalized into a repository-wide claim that Founder Control Room has no live generation capability.',
  'must be revalidated from its authoritative code and provider/runtime evidence before reuse.',
  'it must not be used as present-state evidence for the capabilities of Founder Control Room as a whole.',
] as const;

describe('durable social-policy temporal truth', () => {
  it('does not preserve once-true provider/generation absence as present repository truth', () => {
    for (const staleClaim of FORBIDDEN_REPOSITORY_WIDE_STALE_CLAIMS) {
      expect(socialPolicy).not.toContain(staleClaim);
    }
  });

  it('keeps module scope explicit and forces current capability claims back to authoritative evidence', () => {
    for (const boundary of REQUIRED_TEMPORAL_BOUNDARIES) {
      expect(socialPolicy).toContain(boundary);
    }
  });
});

describe('repository documentation truth control', () => {
  it('does not let a frozen refresh date masquerade as current repository truth', () => {
    expect(readme).not.toContain('**Last refreshed:**');
    expect(readme).toContain('Current identity is resolved at use time');
    expect(readme).toContain('Documentation truth gate');
  });

  it('documents current capability and founder-content authority without promoting runtime assumptions', () => {
    expect(readme).toContain('`.control/capability.json`');
    expect(readme).toContain('canonical capability authority');
    expect(readme).toContain('first-party LinkedIn');
    expect(readme).toContain('provider-neutral n8n');
    expect(readme).toContain('provider readback');
    expect(readme).toContain('Sauce Guard');
  });

  it('documents the current FCR independent-review membrane and keeps live GitHub separate', () => {
    expect(mergeAuthority).toContain('Independent review');
    expect(mergeAuthority).toContain('FCR_TRUSTED_SEMANTIC_REVIEWER_IDS');
    expect(mergeAuthority).toContain('live GitHub');
    expect(mergeAuthority).toContain('separate provider gate');
    expect(mergeAuthority).toContain('Documentation truth');
  });

  it('keeps the shared AI workflow on truth leases, docs sync, product design, analytics, and value review', () => {
    expect(globalAi).toContain('Truth Lease');
    expect(globalAi).toContain('Documentation truth');
    expect(globalAi).toContain('Product Design');
    expect(globalAi).toContain('Data Analytics');
    expect(globalAi).toContain('Hormozi');
    expect(globalAi).toContain('Parallel thinking never grants parallel mutation authority');
  });

  it('keeps ChatGPT and the launch loop on post-merge re-observation', () => {
    expect(chatgpt).toContain('post-merge re-observation');
    expect(chatgpt).toContain('Documentation Truth');
    expect(chatgpt).toContain('Truth Lease');
    expect(launchLoop).toContain('Parallel lenses, serialized authority');
    expect(launchLoop).toContain('Documentation truth gate');
    expect(launchLoop).toContain('Truth Lease');
  });

  it('keeps Cloudflare source binding requirements separate from live provider proof', () => {
    expect(cloudflareTargets).toContain('FCR_API');
    expect(cloudflareTargets).toContain('Service Binding');
    expect(cloudflareTargets).toContain('not a claim that the current Cloudflare Pages project is configured correctly');
  });

  it('makes Documentation Truth load-bearing instead of an optional badge', () => {
    expect(ci).toContain('documentation-truth:');
    expect(ci).toMatch(/needs:[\s\S]*- documentation-truth/);
    expect(ci).toContain('DOCUMENTATION_TRUTH_RESULT: ${{ needs.documentation-truth.result }}');
    expect(documentationWorkflow).toContain('Documentation truth gate');
    expect(documentationWorkflow).toContain('scripts/verify-documentation-truth.mjs');
  });

  it('keeps documentation analytics observation-only', () => {
    expect(truthDecay).toContain('Documentation truth gate');
    expect(truthDecay).toContain('**Analytics remains observation-only.**');
  });
});
