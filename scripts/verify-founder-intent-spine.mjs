import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260911164000_founder_intent_project_mission_outcome_spine.sql', 'utf8');

const required = [
  'create table if not exists founder_intents',
  'create table if not exists founder_intent_projects',
  'alter table missions add column if not exists founder_intent_id',
  'create table if not exists outcomes',
  "classification in ('achieved','partial','failed','unknown')",
  'references founder_intents(id)',
  'references projects(id)',
  'references missions(id)',
  'enable row level security',
  'revoke all on table founder_intents from anon, authenticated',
  'revoke all on table outcomes from anon, authenticated',
];

for (const fragment of required) {
  if (!migration.includes(fragment)) throw new Error(`founder_intent_spine_missing:${fragment}`);
}

const forbidden = [
  'drop table missions',
  'drop table projects',
  'disable row level security',
];
for (const fragment of forbidden) {
  if (migration.toLowerCase().includes(fragment)) throw new Error(`founder_intent_spine_forbidden:${fragment}`);
}

console.log('FounderIntent -> Project -> Mission -> Outcome spine contract verified.');
