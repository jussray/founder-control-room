import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluate } from './founder-signal-draft-evidence-gate.mjs';

// Synthetic fixtures are NOT provider receipts. No mocks, network, or external writes.
const NOW = Date.parse('2026-10-26T12:00:00Z');
const sha = 'a'.repeat(40);
const copy = 'This proposed Founder Signal Engine update documents a narrowly scoped verified source change; it does not claim product launch or live promotion.';
const digest = createHash('sha256').update(copy, 'utf8').digest('hex');
const resultFor = value => evaluate(value, { nowMs: NOW });

function packet() {
  return {
    contract: 'fse/draft-evidence@v1',
    control_room: { repository: 'jussray/founder-control-room', main_sha: 'b'.repeat(40) },
    source: { repository: 'jussray/Sekret-Bip', commit_sha: sha, proof_url: 'https://github.com/jussray/Sekret-Bip/pull/599', event_id: 'synthetic-event', event_at: '2026-10-25T12:00:00Z' },
    zapier: { run_id: 'synthetic-zap', run_url: 'https://example.org/zap-run', trigger_type: 'github_pull_request', source_commit_sha: sha, status: 'success', observed_at: '2026-10-25T12:01:00Z' },
    analysis: { who:'founder', what:'scoped repair', where:'GitHub', when:'now', why:'verifiable progress', how:'controlled drafting', send_decision:'review-only', draft: copy, draft_sha256: digest },
    buffer: { provider:'buffer', method:'draft', destination_mode:'draft', save_to_draft:true, publish_allowed:false, share_now_allowed:false, scheduled_at:null, post_id:'synthetic-post', channel_id:'synthetic-channel', receipt_url:'https://example.org/buffer-receipt', submitted_text:copy,
      readback: { post_id:'synthetic-post', channel_id:'synthetic-channel', status:'draft', published:false, scheduled_at:null, text:copy, observed_at:'2026-10-25T12:02:00Z', provider_url:'https://example.org/buffer-draft' } },
    hubspot: { deal_id:'337185466050', associated_deal_id:'337185466050', task_or_note_id:'synthetic-task', record_url:'https://example.org/task', observed_at:'2026-10-25T12:02:30Z' },
    fcr: { receipt_id:'synthetic-receipt', source_commit_sha:sha, zapier_run_id:'synthetic-zap', buffer_post_id:'synthetic-post', draft_sha256:digest, receipt_url:'https://example.org/fcr', observed_at:'2026-10-25T12:03:00Z' },
  };
}
const rejects = (mutation, criterion) => {
  const p=packet();mutation(p);const r=resultFor(p);
  assert.equal(r.status, 'INCOMPLETE');
  if (criterion) assert.equal(r.findings.find(f=>f.key===criterion)?.state, 'FAIL');
};

test('even fully internally consistent synthetic claims NEVER become verified proof', () => {
  const r=resultFor(packet());
  assert.equal(r.status, 'PACKET_CONSISTENT_UNVERIFIED');
  assert.equal(r.provenance, 'UNAUTHENTICATED_INPUT');
  assert.equal(r.passed, r.total);
  assert.ok(r.total >= 15);
});
test('empty and malformed packets fail closed', () => {
  assert.equal(resultFor({}).status, 'INCOMPLETE');
  assert.equal(resultFor(null).status, 'INCOMPLETE');
  assert.equal(resultFor([]).status, 'INCOMPLETE');
});
test('queue, schedule, and publish requests cannot pass', () => {
  for (const mode of ['queue','schedule','publish']) rejects(p => { p.buffer.method=mode; }, 'buffer_draft_only');
  rejects(p => { p.buffer.scheduled_at='2026-10-25T13:00:00Z'; }, 'buffer_draft_only');
  rejects(p => { p.buffer.share_now_allowed=true; }, 'buffer_draft_only');
});
test('changed approved draft hash is rejected', () => rejects(p => { p.analysis.draft+=' altered'; }, 'draft_integrity'));
test('changed Buffer submitted text is rejected', () => rejects(p => { p.buffer.submitted_text+=' changed'; }, 'buffer_copy_match'));
test('changed Buffer native-readback text is rejected', () => rejects(p => { p.buffer.readback.text+=' changed'; }, 'buffer_copy_match'));
test('wrong provider identity and published status are rejected', () => {
  rejects(p => { p.buffer.readback.post_id='wrong'; }, 'buffer_readback');
  rejects(p => { p.buffer.readback.channel_id='wrong'; }, 'buffer_readback');
  rejects(p => { p.buffer.readback.published=true; }, 'buffer_readback');
});
test('wrong HubSpot deal association is rejected', () => rejects(p => { p.hubspot.associated_deal_id='123'; }, 'hubspot_association'));
test('mismatched FCR / Zapier correlation is rejected', () => rejects(p => { p.fcr.zapier_run_id='wrong'; }, 'fcr_correlation'));
test('stale chronology and future-dated synthetic events are rejected', () => {
  rejects(p => { p.hubspot.observed_at='2026-10-25T11:00:00Z'; }, 'chronology');
  rejects(p => { p.buffer.readback.observed_at='2026-10-27T12:00:00Z'; }, 'chronology');
  rejects(p => { p.fcr.observed_at='2026-10-27T12:00:00Z'; }, 'chronology');
});
test('source identity and untrusted proof URLs fail closed', () => {
  rejects(p => { p.source.commit_sha='short'; }, 'source');
  rejects(p => { p.source.proof_url='http://example.org/test'; }, 'source');
});
