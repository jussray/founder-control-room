import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const skill = readFileSync(
  new URL('../../.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md', import.meta.url),
  'utf8',
);

describe('L99 Founder-Ops Zapier bridge contract', () => {
  it('keeps failed lookups unknown until authoritative evidence proves absence', () => {
    for (const phrase of [
      'A failed lookup is not proof of absence.',
      '`VERIFIED`',
      '`INFERRED`',
      '`UNKNOWN`',
      'A null, empty, timed-out, permission-denied, or structurally unsupported lookup is `UNKNOWN`',
      'A null lookup must never be reported as verified deletion, movement, staleness, or absence.',
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it('routes each evidence layer to an authoritative reader', () => {
    for (const phrase of [
      'Supabase MCP `list_migrations`, `get_advisors`',
      'Cloudflare MCP `workers_list`, `workers_get_worker`',
      'authenticated GitHub Actions run page',
      'HubSpot MCP `search_crm_objects`',
      "Zapier's GitHub metadata actions",
      'When one tool structurally cannot reach a layer, switch tools.',
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it('requires freshness and resolved-target readback before conclusions or writes', () => {
    for (const phrase of [
      're-read the authoritative state',
      'pin the finding to an immutable run ID',
      'inspect the returned `resolvedParams`',
      'read the target back after the write',
      'A successful connector response without target verification is not proof',
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it('preserves non-publishing authority and the L99 report shape', () => {
    for (const phrase of [
      'PUBLISH_ALLOWED = false',
      'This card authorizes nothing.',
      'REALITY:   what is VERIFIED right now',
      'FIX:       what changed',
      'PROOF:     tests, logs, run IDs',
      'RISK:      what could still be wrong',
      'ROLLBACK:  how to reverse safely',
      'NEXT GATE: one exact founder decision or next action',
    ]) {
      expect(skill).toContain(phrase);
    }
  });
});
