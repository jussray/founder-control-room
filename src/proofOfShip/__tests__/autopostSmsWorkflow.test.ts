import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/proof-of-ship-autopost-sms.yml', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260809015000_proof_of_ship_publication_sms_receipts.sql',
  'utf8',
);

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `missing section end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('explicit proof-of-ship publication contract', () => {
  it('requires manual exact-SHA dispatch and auditable founder approval', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('workflow_run:');
    expect(workflow).toContain('founder_approval_id:');
    expect(workflow).toContain('FOUNDER_APPROVAL_ID: ${{ inputs.founder_approval_id }}');
    expect(workflow).toContain('proof-of-ship-founder-review-${{ env.EXPECTED_SHA }}');
    expect(workflow).toContain('run-id: ${{ env.DEPLOY_RUN_ID }}');
    expect(workflow).toContain('.cloudflare_live_sha == $sha');
    expect(workflow).toContain('((.supabase_state == "verified") or (.supabase_state == "not_applicable"))');
  });

  it('promotes held proof only through explicit founder approval', () => {
    const payload = section(
      workflow,
      '      - name: Build explicitly approved publication payload',
      '      - name: Send approved accomplishment to publication conveyor',
    );

    expect(payload).toContain('.publish_allowed = true');
    expect(payload).toContain('.PUBLISH_ALLOWED = true');
    expect(payload).toContain('.authorization_mode = "explicit-founder-approval"');
    expect(payload).toContain('--arg founder_approval_id "$FOUNDER_APPROVAL_ID"');
    expect(payload).toContain('.founder_approval_id == $approval');
    expect(payload).not.toContain('.authorization_mode = "standing-policy"');
    expect(payload).not.toContain('standing-policy:');
    expect(payload).toContain('.notification_mode = "sms_after_publish"');
    expect(payload).toContain('.completion_contract = "published_live_url_and_sms_delivered_v1"');
  });

  it('does not classify scheduling as completion', () => {
    const receipt = section(
      workflow,
      '      - name: Wait for live publication and delivered SMS receipt',
      '      - name: Publish approved conveyor proof summary',
    );

    expect(receipt).toContain('.receipt.bufferTerminalAction == "schedule"');
    expect(receipt).toContain('.receipt.bufferPublicationStatus == "published"');
    expect(receipt).toContain('(.receipt.livePostUrl | startswith("https://"))');
    expect(receipt).toContain('.receipt.smsNotificationStatus == "delivered"');
    expect(receipt).toContain('(.receipt.smsMessageId | type == "string" and length > 0)');
    expect(receipt).toContain('Publication completion unproven');
  });

  it('keeps phone numbers and post bodies out of the database migration', () => {
    expect(migration).toContain('buffer_publication_status');
    expect(migration).toContain('live_post_url');
    expect(migration).toContain('sms_message_id');
    expect(migration).toContain('sms_delivered_at');
    expect(migration).not.toMatch(/phone_number|recipient_phone|post_body|linkedin_draft/i);
  });
});
