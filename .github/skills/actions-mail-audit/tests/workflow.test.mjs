import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../../workflows/actions-mail-audit-monitor.yml', import.meta.url), 'utf8');

describe('read-only scheduled auditor launch gate', () => {
  it('is default-off, main-only, and never consumes PR code with OAuth secrets', () => {
    assert.ok(workflow.includes("vars.FCR_GMAIL_AUDIT_ENABLED == 'true'"));
    assert.ok(workflow.includes("github.ref == 'refs/heads/main'"));
    assert.ok(workflow.includes('workflow_dispatch:'));
    assert.ok(workflow.includes('schedule:'));
    assert.ok(!workflow.includes('pull_request:'));
    assert.ok(!workflow.includes('pull_request_target:'));
  });
  it('grants only read permissions and supplies no application writes', () => {
    assert.match(workflow, /permissions:\s+contents: read\s+actions: read/);
    assert.ok(!workflow.includes('contents: write'));
    assert.ok(!workflow.includes('actions: write'));
    assert.ok(!workflow.includes('id-token: write'));
    assert.ok(!workflow.includes('persist-credentials: true'));
    assert.ok(workflow.includes('persist-credentials: false'));
    assert.ok(workflow.includes('set -euo pipefail'));
  });
  it('uses dedicated mailbox refresh secrets, never FCR Gmail sender credentials', () => {
    for (const secret of [
      'FCR_GMAIL_AUDIT_MAIN_REFRESH_TOKEN',
      'FCR_GMAIL_AUDIT_BIP_REFRESH_TOKEN',
      'FCR_GMAIL_AUDIT_RAY_REFRESH_TOKEN',
      'FCR_GMAIL_AUDIT_CLIENT_ID',
      'FCR_GMAIL_AUDIT_CLIENT_SECRET'
    ]) assert.ok(workflow.includes(secret), 'Missing ' + secret);
    assert.ok(!workflow.includes('FCR_GMAIL_REFRESH_TOKEN'));
    assert.ok(!workflow.includes('FCR_GMAIL_ACCESS_TOKEN'));
  });
  it('composes bounded sanitization and never emits raw message or token payloads', () => {
    assert.equal((workflow.match(/scripts\/gmail-readonly\.mjs/g) || []).length, 3);
    assert.equal((workflow.match(/scripts\/triage\.mjs/g) || []).length, 3);
    assert.equal((workflow.match(/scripts\/report\.mjs/g) || []).length, 3);
    assert.ok(!workflow.includes('upload-artifact'));
    assert.ok(!workflow.includes('messages/send'));
  });
});
