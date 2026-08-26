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

  it('claims the founder approval once and re-reads it immediately before apply', () => {
    const authorityStep = recovery.match(
      /- name: Verify exact current main and claim mutation approval([\s\S]*?)- name: Set up Node 24/,
    )?.[1] ?? '';
    const revalidateStep = recovery.match(
      /- name: Revalidate claimed founder mutation receipt immediately before apply([\s\S]*?)- name: Apply bounded Access exemption with dedicated admin authority/,
    )?.[1] ?? '';

    expect(authorityStep).toMatch(/\^issue-comment:\(\[0-9\]\+\)\$/);
    expect(authorityStep).toMatch(/issues\/comments\/\$\{comment_id\}/);
    expect(authorityStep).toMatch(/\.user\.login == "jussray"/);
    expect(authorityStep).toMatch(/issues\/485/);
    expect(authorityStep).toMatch(/\/cloudflare-fcr-access apply \$\{EXPECTED_HEAD_SHA\}/);
    expect(authorityStep).toMatch(/\.created_at == \.updated_at/);
    expect(authorityStep).toMatch(/fcr-access-approval-claim:v1/);
    expect(authorityStep).toMatch(/Consumed founder mutation receipt/);
    expect(authorityStep).toMatch(/claim_comment_id=/);

    expect(revalidateStep).toMatch(/\^issue-comment:\(\[0-9\]\+\)\$/);
    expect(revalidateStep).toMatch(/issues\/comments\/\$\{comment_id\}/);
    expect(revalidateStep).toMatch(/\.user\.login == "jussray"/);
    expect(revalidateStep).toMatch(/\.created_at == \.updated_at/);
    expect(revalidateStep).toMatch(/CLAIM_COMMENT_ID/);
    expect(revalidateStep).toMatch(/github-actions\[bot\]/);
    expect(revalidateStep).toMatch(/Founder mutation approval revoked/);
    expect(revalidateStep).toMatch(/test "\$current_main" = "\$EXPECTED_HEAD_SHA"/);
  });
});
