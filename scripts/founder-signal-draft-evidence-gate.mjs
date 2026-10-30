#!/usr/bin/env node
/**
 * Offline Founder Signal Engine Buffer DRAFT evidence packet consistency checker.
 * Untrusted JSON is NOT authenticated provider proof or release authority.
 * This module has no network, provider, database, or repository-write clients.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHA40 = /^[0-9a-f]{40}$/i;
const SHA64 = /^[0-9a-f]{64}$/i;
const REPOSITORY = 'jussray/founder-control-room';
const HUBSPOT_DEAL = '337185466050';
const str = value => typeof value === 'string' ? value.trim() : '';
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const time = value => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
function https(value) {
  try { return new URL(str(value)).protocol === 'https:'; }
  catch { return false; }
}

export function evaluate(packet, options = {}) {
  const findings = [];
  const check = (key, ok, reason) => findings.push({ key, state: ok ? 'PASS' : 'FAIL', ...(ok ? {} : { reason }) });
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return { status: 'INCOMPLETE', provenance: 'UNAUTHENTICATED_INPUT', findings: [{ key: 'packet', state: 'FAIL', reason: 'Object required' }] };
  }
  const source = packet.source ?? {};
  const ai = packet.analysis ?? {};
  const zap = packet.zapier ?? {};
  const buffer = packet.buffer ?? {};
  const back = buffer.readback ?? {};
  const hub = packet.hubspot ?? {};
  const fcr = packet.fcr ?? {};
  const control = packet.control_room ?? {};
  const message = str(ai.draft);
  const digest = hash(message);
  const stamps = [source.event_at, zap.observed_at, back.observed_at, hub.observed_at, fcr.observed_at].map(time);
  const timesValid = stamps.every(t => t !== null && t <= nowMs && t >= 0);
  const eventsOrdered = timesValid && stamps[0] <= stamps[1] &&
    stamps[1] <= stamps[2] && stamps[1] <= stamps[3] &&
    stamps[2] <= stamps[4] && stamps[3] <= stamps[4];

  check('contract', packet.contract === 'fse/draft-evidence@v1', 'Unknown evidence packet contract');
  check('control_room_source', control.repository === REPOSITORY && SHA40.test(str(control.main_sha)), 'Control Room repository and exact source SHA required');
  check('source', /^jussray\/[A-Za-z0-9_.-]+$/.test(str(source.repository)) && SHA40.test(str(source.commit_sha)) && https(source.proof_url), 'Founder-owned source, full SHA and HTTPS proof link required');
  check('source_event', str(source.event_id).length > 0 && time(source.event_at) !== null, 'Source event ID and timestamp required');
  check('zapier', str(zap.run_id).length > 0 && https(zap.run_url) &&
    zap.trigger_type === 'github_pull_request' && zap.source_commit_sha === source.commit_sha && zap.status === 'success', 'Correlated PR trigger and actual Zapier run reference required');
  check('analysis_5w1h', ['who','what','where','when','why','how'].every(k => str(ai[k]).length > 0), 'All six 5W1H fields required');
  check('send_decision', ['review-only','publish-draft'].includes(ai.send_decision), 'Only review-eligible drafts accepted');
  check('draft_integrity', message.length >= 80 && SHA64.test(str(ai.draft_sha256)) && str(ai.draft_sha256).toLowerCase() === digest, 'Finished draft and matching SHA-256 required');
  check('buffer_draft_only', buffer.provider === 'buffer' && buffer.method === 'draft' &&
    buffer.destination_mode === 'draft' && buffer.save_to_draft === true &&
    buffer.publish_allowed === false && buffer.share_now_allowed === false &&
    buffer.scheduled_at === null, 'Buffer must remain draft-only with no schedule or publish authority');
  check('buffer_receipt', str(buffer.post_id).length > 0 && str(buffer.channel_id).length > 0 &&
    https(buffer.receipt_url), 'Buffer identity and artifact link required');
  check('buffer_readback', back.post_id === buffer.post_id && back.channel_id === buffer.channel_id &&
    back.status === 'draft' && back.published === false && back.scheduled_at === null &&
    https(back.provider_url) && time(back.observed_at) !== null, 'Matching native Buffer Drafts readback required');
  check('buffer_copy_match', typeof back.text === 'string' && back.text === message &&
    typeof buffer.submitted_text === 'string' && buffer.submitted_text === message,
    'Submitted and read-back Buffer content must exactly match approved draft');
  check('hubspot_association', String(hub.deal_id) === HUBSPOT_DEAL &&
    String(hub.associated_deal_id) === HUBSPOT_DEAL && str(hub.task_or_note_id).length > 0 &&
    https(hub.record_url), 'Exact Founder Signal Engine deal-associated HubSpot artifact required');
  check('fcr_correlation', str(fcr.receipt_id).length > 0 && fcr.source_commit_sha === source.commit_sha &&
    fcr.zapier_run_id === zap.run_id && fcr.buffer_post_id === buffer.post_id &&
    str(fcr.draft_sha256).toLowerCase() === digest && https(fcr.receipt_url),
    'FCR receipt must correlate exact source, Zap run, Buffer post, and copy hash');
  check('chronology', eventsOrdered, 'Events must be valid, not future-dated, and ordered through final FCR observation');

  const passed = findings.filter(f => f.state === 'PASS').length;
  return {
    status: passed === findings.length ? 'PACKET_CONSISTENT_UNVERIFIED' : 'INCOMPLETE',
    provenance: 'UNAUTHENTICATED_INPUT',
    warning: 'Internal JSON consistency only; never authenticated provider evidence, live deployment proof, founder authorization, or publication approval.',
    passed, total: findings.length, findings,
  };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    process.stdout.write(JSON.stringify({status:'INCOMPLETE', reason:'EVIDENCE_PACKET_NOT_PROVIDED', usage:'node scripts/founder-signal-draft-evidence-gate.mjs path/to/evidence.json'}, null, 2) + '\n');
    process.exitCode = 2;
    return;
  }
  try {
    if (statSync(path).size > 1_000_000) throw new Error('packet_size_limit');
    const result = evaluate(JSON.parse(readFileSync(path, 'utf8')));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.status !== 'PACKET_CONSISTENT_UNVERIFIED') process.exitCode = 2;
  } catch (error) {
    // Never echo raw input, secrets or draft body on parse failure.
    process.stdout.write(JSON.stringify({status:'INCOMPLETE', reason:'PACKET_READ_OR_PARSE_ERROR', error_type: error?.name ?? 'Error'}, null, 2) + '\n');
    process.exitCode = 2;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
