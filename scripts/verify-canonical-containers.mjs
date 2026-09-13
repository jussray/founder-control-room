import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260911170500_truth_continuity_decision_resource_recovery.sql', 'utf8');

const required = [
  'create table if not exists truth_snapshots',
  'create table if not exists continuity_records',
  'create table if not exists founder_decisions',
  'create table if not exists resource_budgets',
  'create table if not exists recovery_plans',
  "classification in ('verified','inferred','unknown','blocked','conflicted','stale')",
  'source_truth', 'build_truth', 'test_truth', 'ci_truth', 'deployment_truth', 'runtime_truth', 'provider_truth', 'outcome_truth',
  'subject_fingerprint', 'authority_fingerprint', 'runtime_fingerprint', 'evidence_fingerprint',
  "resource_type in ('money','founder_hours','contractor_hours','compute','api_limit','attention','other')",
  'rollback jsonb', 'retry jsonb', 'reconcile jsonb', 'compensate jsonb', 'abandon jsonb',
  'revoke all on table truth_snapshots from anon, authenticated',
  'revoke all on table recovery_plans from anon, authenticated',
];
for (const fragment of required) {
  if (!sql.includes(fragment)) throw new Error(`canonical_container_missing:${fragment}`);
}

const lower = sql.toLowerCase();
for (const forbidden of ['drop table', 'disable row level security']) {
  if (lower.includes(forbidden)) throw new Error(`canonical_container_forbidden:${forbidden}`);
}

console.log('FCR canonical truth/continuity/decision/resource/recovery containers verified.');
