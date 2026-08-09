import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/proof-of-ship-autopost-sms.yml', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260809015000_proof_of_ship_publication_sms_receipts.sql',
  'utf8',
);

describe('content-bound proof-of-ship publication authority', () => {
  it('is manual-only and requires exact release plus reviewed-draft identifiers', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('workflow_run:');
    expect(workflow).toContain('expected_sha:');
    expect(workflow).toContain('deploy_run_id:');
    expect(workflow).toContain('founder_approval_id:');
    expect(workflow).toContain('approved_draft_ref:');
    expect(workflow).toContain('approved_draft_sha256:');
    expect(workflow).toContain('proof-of-ship-founder-review-${{ env.EXPECTED_SHA }}');
    expect(workflow).toContain('run-id: ${{ env.DEPLOY_RUN_ID }}');
  });

  it('preserves exact release proof before considering publication authority', () => {
    expect(workflow).toContain('.commit_sha == $sha');
    expect(workflow).toContain('.source_commit_sha == $sha');
    expect(workflow).toContain('.cloudflare_live_sha == $sha');
    expect(workflow).toContain('((.supabase_state == "verified") or (.supabase_state == "not_applicable"))');
    expect(workflow).toContain('.publish_allowed == false');
    expect(workflow).toContain('.PUBLISH_ALLOWED == false');
    expect(workflow).toContain('.authorization_mode == "founder-review-required"');
    expect(workflow).toContain('.buffer_terminal_action == "hold"');
  });

  it('fails closed until approval is registry-backed and bound to exact reviewed content', () => {
    expect(workflow).toContain('APPROVED_DRAFT_REF: ${{ inputs.approved_draft_ref }}');
    expect(workflow).toContain('APPROVED_DRAFT_SHA256: ${{ inputs.approved_draft_sha256 }}');
    expect(workflow).toContain('^\[0-9a-f\]{64}$');
    expect(workflow).toContain('Enforce registry-backed content approval before any external send');
    expect(workflow).toContain('Content-bound founder approval registry required');
    expect(workflow).toContain('Publication is fail-closed');
    expect(workflow).toContain('exit 1');
  });

  it('contains no reachable publication provider mutation while the registry gate is absent', () => {
    expect(workflow).not.toContain('ZAPIER_CATCH_HOOK_URL');
    expect(workflow).not.toContain('buffer_add_to_queue');
    expect(workflow).not.toContain('.publish_allowed = true');
    expect(workflow).not.toContain('.PUBLISH_ALLOWED = true');
    expect(workflow).not.toContain('--data-binary');
    expect(workflow).not.toMatch(/curl\s/);
  });

  it('keeps phone numbers and post bodies out of the publication receipt migration', () => {
    expect(migration).toContain('buffer_publication_status');
    expect(migration).toContain('live_post_url');
    expect(migration).toContain('sms_message_id');
    expect(migration).toContain('sms_delivered_at');
    expect(migration).not.toMatch(/phone_number|recipient_phone|post_body|linkedin_draft/i);
  });
});
