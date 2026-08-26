import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bridge = readFileSync('.github/workflows/fcr-cloudflare-command-bridge.yml', 'utf8');
const recovery = readFileSync('.github/workflows/fcr-access-front-door-recovery.yml', 'utf8');

describe('FCR Cloudflare founder mutation receipt', () => {
  it('derives apply authority from the exact founder issue comment rather than caller text', () => {
    expect(bridge).toMatch(/github\.event\.issue\.number == 485/);
    expect(bridge).toMatch(/github\.event\.comment\.user\.login == 'jussray'/);
    expect(bridge).toMatch(/COMMENT_ID: \$\{\{ github\.event\.comment\.id \}\}/);
    expect(bridge).toMatch(/approval_reference="issue-comment:\$COMMENT_ID"/);
    expect(bridge).toMatch(/COMMENT_BODY" != "\/cloudflare-fcr-access \$action \$sha"/);
    expect(bridge).not.toMatch(/apply requires an auditable 8-200 character approval reference/);
  });

  it('re-reads the founder approval receipt before any apply path can continue', () => {
    const authorityStep = recovery.match(
      /- name: Verify exact current main and mutation approval([\s\S]*?)- name: Set up Node 24/,
    )?.[1] ?? '';

    expect(authorityStep).toMatch(/\^issue-comment:\(\[0-9\]\+\)\$/);
    expect(authorityStep).toMatch(/issues\/comments\/\$\{comment_id\}/);
    expect(authorityStep).toMatch(/\.user\.login == "jussray"/);
    expect(authorityStep).toMatch(/issues\/485/);
    expect(authorityStep).toMatch(/\/cloudflare-fcr-access apply \$\{EXPECTED_HEAD_SHA\}/);
    expect(authorityStep).toMatch(/Invalid founder mutation receipt/);
  });
});
