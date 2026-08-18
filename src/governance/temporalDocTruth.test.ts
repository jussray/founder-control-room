import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOCIAL_POLICY_PATH = resolve(
  process.cwd(),
  'docs/founder-signal-engine/social-campaign-policy-v1.md',
);

const socialPolicy = readFileSync(SOCIAL_POLICY_PATH, 'utf8');

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
