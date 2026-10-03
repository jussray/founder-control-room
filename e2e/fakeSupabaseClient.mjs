// Fake replacement for src/lib/supabaseClient.ts, loaded only under
// e2e/loader.mjs. Implements exactly the query-builder chains this repo's
// route/controller code actually calls (verified against the real source),
// backed by the in-memory store in fakeStore.mjs.
import { createHash, randomUUID } from 'node:crypto';
import { table, matchesFilters, sortRows, withDefaults } from './fakeStore.mjs';

class QueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
    this.mode = null;
    this.filters = [];
    this.insertRows = null;
    this.updateFields = null;
    this.upsertConflictCols = null;
    this.orderCol = null;
    this.orderAsc = true;
    this.limitN = null;
    this._promise = null;
  }

  select() { if (!this.mode) this.mode = 'select'; return this; }
  insert(rows) { this.mode = 'insert'; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(fields) { this.mode = 'update'; this.updateFields = fields; return this; }
  upsert(rows, opts) {
    this.mode = 'upsert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.upsertConflictCols = (opts?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this;
  }
  delete() { this.mode = 'delete'; return this; }

  eq(col, val) { this.filters.push({ col, op: 'eq', val }); return this; }
  is(col, val) { this.filters.push({ col, op: 'is', val }); return this; }
  in(col, arr) { this.filters.push({ col, op: 'in', val: arr }); return this; }
  gt(col, val) { this.filters.push({ col, op: 'gt', val }); return this; }
  gte(col, val) { this.filters.push({ col, op: 'gte', val }); return this; }
  lt(col, val) { this.filters.push({ col, op: 'lt', val }); return this; }
  filter(colExpr, _op, val) { this.filters.push({ col: colExpr, op: 'eq', val }); return this; }
  order(col, opts = {}) { this.orderCol = col; this.orderAsc = opts.ascending !== false; return this; }
  limit(n) { this.limitN = n; return this; }

  single() { return this._run({ wantSingle: true, allowZero: false }); }
  maybeSingle() { return this._run({ wantSingle: true, allowZero: true }); }

  then(resolve, reject) {
    if (!this._promise) this._promise = this._run({ wantSingle: false });
    return this._promise.then(resolve, reject);
  }

  async _run({ wantSingle, allowZero }) {
    const rows = table(this.tableName);

    if (this.mode === 'insert') {
      const inserted = this.insertRows.map((r) => {
        const row = withDefaults(r, this.tableName);
        rows.push(row);
        return row;
      });
      return this._shapeResult(inserted, wantSingle, allowZero);
    }

    if (this.mode === 'upsert') {
      const results = this.insertRows.map((r) => {
        const conflictKeys = this.upsertConflictCols.length ? this.upsertConflictCols : Object.keys(r);
        const existingIdx = rows.findIndex((row) => conflictKeys.every((k) => row[k] === r[k]));
        if (existingIdx >= 0) {
          rows[existingIdx] = { ...rows[existingIdx], ...r, updated_at: new Date().toISOString() };
          return rows[existingIdx];
        }
        const row = withDefaults(r, this.tableName);
        rows.push(row);
        return row;
      });
      return this._shapeResult(results, wantSingle, allowZero);
    }

    const matched = rows.filter((row) => matchesFilters(row, this.filters));

    if (this.mode === 'update') {
      for (const row of matched) Object.assign(row, this.updateFields, { updated_at: new Date().toISOString() });
      return this._shapeResult(matched, wantSingle, allowZero);
    }

    if (this.mode === 'delete') {
      const remaining = rows.filter((row) => !matchesFilters(row, this.filters));
      table(this.tableName).length = 0;
      table(this.tableName).push(...remaining);
      return { data: null, error: null };
    }

    // select
    let result = sortRows(matched, this.orderCol, this.orderAsc);
    if (this.limitN != null) result = result.slice(0, this.limitN);
    return this._shapeResult(result, wantSingle, allowZero);
  }

  _shapeResult(rows, wantSingle, allowZero) {
    if (!wantSingle) return { data: rows, error: null };
    if (rows.length === 0) {
      return allowZero ? { data: null, error: null } : { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
    }
    return { data: rows[0], error: null };
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function classifyTruthEvidence(rows) {
  if (rows.length === 0) return 'unknown';
  if (rows.some((row) => row.relation === 'contradicts' || row.status === 'fail')) return 'conflicted';
  const supporting = rows.filter((row) => row.relation === 'supports');
  const allSupportingPass = supporting.length > 0 && supporting.every((row) => row.status === 'pass');
  const hasIndependentSupport = supporting.some((row) => (
    row.status === 'pass'
    && ['github', 'cloudflare', 'supabase', 'playwright'].includes(row.provider)
    && row.environment !== 'truth-console'
  ));
  if (allSupportingPass && hasIndependentSupport) return 'verified';
  if (rows.some((row) => row.status === 'pending')) return 'unknown';
  return 'inferred';
}

function invalidateTruthContinuity(claim, reason, now) {
  const invalidated = [];
  if (!claim.current_subject_fingerprint) return invalidated;
  for (const row of table('continuity_records')) {
    if (
      row.project_id === claim.project_id
      && row.subject_fingerprint === claim.current_subject_fingerprint
      && !row.invalidated_at
    ) {
      row.invalidated_at = now;
      row.invalidation_reason = reason;
      invalidated.push({
        id: row.id,
        proof_cookie: row.proof_cookie,
        subject_fingerprint: row.subject_fingerprint,
        invalidated_at: row.invalidated_at,
        invalidation_reason: row.invalidation_reason,
      });
    }
  }
  return invalidated;
}

async function fakeRpc(name, args) {
  if (name === 'try_acquire_controller_lease') {
    const leases = table('controller_leases');
    const existing = leases.find((l) => l.lease_key === args.p_lease_key);
    const now = Date.now();
    if (existing && new Date(existing.expires_at).getTime() > now) {
      return { data: false, error: null };
    }
    const claimedAt = new Date().toISOString();
    const expiresAt = new Date(now + (args.p_ttl_seconds ?? 60) * 1000).toISOString();
    if (existing) {
      existing.claimed_at = claimedAt;
      existing.expires_at = expiresAt;
    } else {
      leases.push({ lease_key: args.p_lease_key, claimed_at: claimedAt, expires_at: expiresAt });
    }
    return { data: true, error: null };
  }

  if (name === 'claim_outbox_work') {
    const now = new Date().toISOString();
    const outbox = table('controller_outbox');
    const claimable = outbox
      .filter((row) => !row.completed_at && !row.claimed_at && row.available_at <= now)
      .slice(0, args.p_limit ?? 10);
    for (const row of claimable) row.claimed_at = now;
    return {
      data: claimable.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        controller: row.controller,
        resource_id: row.resource_id,
        reason: row.reason,
        source_event_id: row.source_event_id,
        attempt_count: row.attempt_count,
        claimed_at: row.claimed_at,
      })),
      error: null,
    };
  }

  if (name === 'complete_outbox_work') {
    const outbox = table('controller_outbox');
    const row = outbox.find((r) => r.id === args.p_id);
    if (!row || row.claimed_at !== args.p_claimed_at || row.completed_at) {
      return { data: null, error: { message: 'outbox_work_claim_not_owned_or_completed' } };
    }
    row.completed_at = new Date().toISOString();
    row.claimed_at = null;
    row.last_error = null;
    if (args.p_source_event_id) {
      const event = table('provider_events').find((r) => r.id === args.p_source_event_id);
      if (!event) return { data: null, error: { message: 'provider_event_not_found' } };
      event.processing_status = 'processed'; event.processed_at = new Date().toISOString();
    }
    return { data: null, error: null };
  }

  if (name === 'fail_outbox_work') {
    const outbox = table('controller_outbox');
    const row = outbox.find((r) => r.id === args.p_id);
    if (!row || row.claimed_at !== args.p_claimed_at || row.completed_at) {
      return { data: null, error: { message: 'outbox_work_claim_not_owned' } };
    }
    row.claimed_at = null;
    row.attempt_count = (row.attempt_count ?? 0) + 1;
    row.last_error = args.p_error;
    const backoffSeconds = 2 ** Math.min(row.attempt_count, 6);
    row.available_at = new Date(Date.now() + backoffSeconds * 1000).toISOString();
    return { data: null, error: null };
  }

  if (name === 'abandon_outbox_work') {
    const outbox = table('controller_outbox');
    const row = outbox.find((r) => r.id === args.p_id);
    if (!row || row.claimed_at !== args.p_claimed_at || row.completed_at) {
      return { data: null, error: { message: 'outbox_work_claim_not_owned_or_completed' } };
    }
    row.completed_at = new Date().toISOString();
    row.claimed_at = null;
    row.attempt_count = (row.attempt_count ?? 0) + 1;
    row.last_error = args.p_error;
    if (args.p_source_event_id) {
      const event = table('provider_events').find((r) => r.id === args.p_source_event_id);
      if (!event) return { data: null, error: { message: 'provider_event_not_found' } };
      event.processing_status = 'failed'; event.last_error = args.p_error;
    }
    return { data: null, error: null };
  }

  if (name === 'is_v10_registry_approved') {
    const candidateHash = String(args?.candidate_hash ?? '').trim().toLowerCase();
    const approved = table('capability_registry_snapshots').some((row) => (
      String(row.registry_hash ?? '').toLowerCase() === candidateHash && row.status === 'approved'
    ));
    return { data: approved, error: null };
  }

  if (name === 'truth_console_attach_evidence') {
    const claim = table('truth_claims').find((row) => row.id === args.p_claim_id);
    if (!claim) return { data: null, error: { message: 'truth_claim_not_found' } };
    const now = new Date().toISOString();
    const evidence = {
      id: randomUUID(),
      project_id: claim.project_id,
      mission_id: null,
      subject: claim.statement,
      kind: args.p_kind,
      status: args.p_status,
      provider: args.p_provider,
      commit_sha: null,
      environment: 'truth-console',
      details_ref: args.p_details_ref,
      reusable_until: null,
      created_at: now,
    };
    table('evidence').push(evidence);
    table('truth_claim_evidence').push({
      claim_id: claim.id,
      evidence_id: evidence.id,
      relation: args.p_relation,
      created_at: now,
    });
    const invalidatedContinuity = invalidateTruthContinuity(claim, 'claim_evidence_changed', now);
    Object.assign(claim, {
      classification: 'stale',
      revision: Number(claim.revision ?? 1) + 1,
      current_truth_snapshot_id: null,
      updated_at: now,
    });
    return {
      data: {
        evidence: { ...evidence, relation: args.p_relation },
        claim: { ...claim },
        invalidatedContinuity,
        authorityEffect: 'none',
      },
      error: null,
    };
  }

  if (name === 'truth_console_reconcile_claim') {
    const claim = table('truth_claims').find((row) => row.id === args.p_claim_id);
    if (!claim) return { data: null, error: { message: 'truth_claim_not_found' } };
    if (Number(claim.revision) !== Number(args.p_expected_revision)) {
      return { data: null, error: { message: 'truth_claim_revision_mismatch' } };
    }

    const links = table('truth_claim_evidence').filter((row) => row.claim_id === claim.id);
    const evidenceById = new Map(table('evidence').map((row) => [row.id, row]));
    const evidenceRows = links
      .map((link) => ({ ...evidenceById.get(link.evidence_id), relation: link.relation }))
      .filter((row) => row.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const classification = classifyTruthEvidence(evidenceRows);
    const identity = evidenceRows.map((row) => ({
      id: row.id,
      status: row.status,
      relation: row.relation,
      provider: row.provider,
      kind: row.kind,
      environment: row.environment,
    }));
    const evidenceIds = evidenceRows.map((row) => row.id);
    const evidenceFingerprint = sha256(JSON.stringify(identity));
    const subjectFingerprint = sha256(JSON.stringify({
      contract: 'fcr/truth-claim-subject@v1',
      claimId: claim.id,
      projectId: claim.project_id,
      statement: claim.statement,
      revision: claim.revision,
    }));
    const now = new Date();
    const nowIso = now.toISOString();
    const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const snapshot = {
      id: randomUUID(),
      founder_intent_id: null,
      project_id: claim.project_id,
      mission_id: null,
      source_truth: {
        contract: 'fcr/truth-claim@v1',
        claimId: claim.id,
        statement: claim.statement,
        revision: claim.revision,
        evidenceIds,
      },
      build_truth: {},
      test_truth: {},
      ci_truth: {},
      deployment_truth: {},
      runtime_truth: {},
      provider_truth: {},
      outcome_truth: { classification },
      conflicts: [],
      classification,
      observed_at: nowIso,
      expires_at: validUntil,
      created_at: nowIso,
    };
    table('truth_snapshots').push(snapshot);
    invalidateTruthContinuity(claim, 'superseded_by_reconciliation', nowIso);
    const proofCookie = `fcr-proof-v1:${sha256(`${subjectFingerprint}:${evidenceFingerprint}:${snapshot.id}`).slice(0, 40)}`;
    const continuity = {
      id: randomUUID(),
      founder_intent_id: null,
      project_id: claim.project_id,
      mission_id: null,
      subject_fingerprint: subjectFingerprint,
      proof_cookie: proofCookie,
      truth_snapshot_id: snapshot.id,
      authority_fingerprint: null,
      runtime_fingerprint: null,
      evidence_fingerprint: evidenceFingerprint,
      valid_until: validUntil,
      invalidated_at: null,
      invalidation_reason: null,
      created_at: nowIso,
    };
    table('continuity_records').push(continuity);
    const receipt = {
      id: randomUUID(),
      project_id: claim.project_id,
      controller: 'TruthConsole',
      resource_id: claim.id,
      reason: 'founder_truth_reconciliation',
      status: classification === 'verified' ? 'converged' : 'drifted',
      observed_changes: [{ classification, revision: claim.revision }],
      proposed_actions: classification === 'verified' ? [] : [{ action: 'review_evidence', authority: 'none' }],
      evidence_ids: evidenceIds,
      requires_approval: false,
      message: `Truth claim reconciled as ${classification}`,
      started_at: nowIso,
      completed_at: nowIso,
    };
    table('reconciliation_runs').push(receipt);
    Object.assign(claim, {
      classification,
      current_truth_snapshot_id: snapshot.id,
      current_subject_fingerprint: subjectFingerprint,
      updated_at: nowIso,
    });
    return {
      data: {
        claim: { ...claim },
        snapshot,
        receipt,
        continuity: { ...continuity, state: 'current' },
        authorityEffect: 'none',
      },
      error: null,
    };
  }

  if (name === 'truth_console_resolve_attack') {
    const attack = table('truth_attacks').find((row) => row.id === args.p_attack_id);
    if (!attack) return { data: null, error: { message: 'truth_attack_not_found' } };
    if (attack.status === 'resolved') return { data: null, error: { message: 'truth_attack_already_resolved' } };
    const claim = table('truth_claims').find((row) => row.id === attack.claim_id);
    if (!claim) return { data: null, error: { message: 'truth_claim_not_found' } };
    const linked = table('truth_claim_evidence').some((row) => (
      row.claim_id === claim.id && row.evidence_id === args.p_evidence_id
    ));
    if (!linked) return { data: null, error: { message: 'truth_attack_evidence_not_linked' } };
    const now = new Date().toISOString();
    const invalidatedContinuity = invalidateTruthContinuity(claim, 'attack_resolution_changed_truth', now);
    Object.assign(claim, {
      classification: 'stale',
      revision: Number(claim.revision ?? 1) + 1,
      current_truth_snapshot_id: null,
      updated_at: now,
    });
    Object.assign(attack, {
      status: 'resolved',
      resolution_answer: args.p_answer,
      resolution_evidence_id: args.p_evidence_id,
      resolved_at: now,
      updated_at: now,
    });
    return {
      data: {
        attack: { ...attack },
        claim: { ...claim },
        invalidatedContinuity,
        cookieState: 'stale',
        authorityEffect: 'none',
      },
      error: null,
    };
  }

  console.warn(`[fake supabase] unhandled rpc "${name}" — returning null`);
  return { data: null, error: null };
}

export const supabase = {
  from(tableName) { return new QueryBuilder(tableName); },
  rpc: fakeRpc,
};

export function makeSupabaseClient() {
  return supabase;
}

// Seed the founder allowlist synchronously at process start, mirroring what
// migration 0002 does for real (`insert into founder_users ...`) — this
// module is the first thing the loader redirects to, so this runs before
// the HTTP server accepts any request.
if (process.env.E2E_SEED_FOUNDER_EMAIL) {
  table('founder_users').push({ email: process.env.E2E_SEED_FOUNDER_EMAIL, created_at: new Date().toISOString() });
}

// E2E-only mirror of the V10 founder approval boundary. The harness must
// explicitly provide one exact registry hash and its canonical entries;
// unlike an "always true" fake, every other registry remains unapproved and
// the real middleware still verifies the entry hash and capability identity.
const approvedV10RegistryHash = String(process.env.E2E_APPROVED_V10_REGISTRY_HASH ?? '').trim().toLowerCase();
if (/^[0-9a-f]{64}$/.test(approvedV10RegistryHash)) {
  let entries = [];
  try {
    const parsed = JSON.parse(process.env.E2E_APPROVED_V10_REGISTRY_ENTRIES_JSON ?? '[]');
    if (Array.isArray(parsed)) entries = parsed;
  } catch {
    throw new Error('E2E_APPROVED_V10_REGISTRY_ENTRIES_JSON must be valid JSON');
  }

  table('capability_registry_snapshots').push({
    registry_hash: approvedV10RegistryHash,
    contract: 'juss-v10/capability-registry@v1',
    status: 'approved',
    entries,
    approved_by: process.env.E2E_SEED_FOUNDER_EMAIL ?? 'e2e-founder',
    approved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}
