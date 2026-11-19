import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSafeSummary } from '../scripts/report.mjs';

const repo = 'jussray/founder-control-room';
const example = (status, url = 'https://github.com/jussray/founder-control-room/actions/runs/12345') => ({
  schema: 'juss.actions-mail-result@v1', repo,
  results: [{
    status, repo, source_url: url, head: 'a'.repeat(40),
    mailbox: 'private-mailbox@example.test',
    message_id: 'PRIVATE_MESSAGE_ID',
    received_at: '2026-10-31T20:00:00Z',
  }],
});

describe('Actions mail summary egress', () => {
  it('shows a current GitHub failure but no mailbox identity or Gmail message ID', () => {
    const text = renderSafeSummary(example('CURRENT_RED'));
    assert.match(text, /CURRENT_RED: 1/);
    assert.match(text, /https:\/\/github\.com\/jussray\/founder-control-room\/actions\/runs\/12345/);
    assert.doesNotMatch(text, /PRIVATE_MESSAGE_ID|private-mailbox/);
  });
  it('does not print a tracking URL or an unrelated project link', () => {
    const tracked = renderSafeSummary(example('CURRENT_RED', 'https://github.com/jussray/founder-control-room/actions/runs/12345?token=private'));
    assert.doesNotMatch(tracked, /token=private/);
    const foreign = renderSafeSummary(example('CURRENT_RED', 'https://github.com/jussray/StoryEngine/actions/runs/999'));
    assert.doesNotMatch(foreign, /StoryEngine/);
  });
  it('classifies security email with no run as unverified', () => {
    const text = renderSafeSummary(example('SECURITY_TRIAGE_UNVERIFIED', null));
    assert.match(text, /SECURITY_TRIAGE_UNVERIFIED: 1/);
    assert.match(text, /No verified run URL/);
  });
  it('fails closed on unsupported status or mismatched repository', () => {
    assert.throws(() => renderSafeSummary(example('DEPLOYED')), /AUDIT_STATE_INVALID/);
    const mismatched = example('CURRENT_RED');
    mismatched.results[0].repo = 'jussray/Sekret-Bip';
    assert.throws(() => renderSafeSummary(mismatched), /AUDIT_STATE_INVALID/);
  });
});
