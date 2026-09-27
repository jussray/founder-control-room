import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');

const [canonical, aiMirror, claudeEntry, contractRaw] = await Promise.all([
  read('skills/ultrathink-devil/SKILL.md'),
  read('.ai/skills/ultrathink-devil/SKILL.md'),
  read('.claude/skills/ultrathink/SKILL.md'),
  read('.control-room/ultrathink-attack.contract.json'),
]);

const contract = JSON.parse(contractRaw);
const failures = [];

function requireTrue(label, value) {
  if (value !== true) failures.push(`${label}: expected true`);
}

function requireFalse(label, value) {
  if (value !== false) failures.push(`${label}: expected false`);
}

function requireText(label, source, expected) {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
}

function requireArrayIncludes(label, values, expected) {
  if (!Array.isArray(values) || !values.includes(expected)) failures.push(`${label}: missing ${expected}`);
}

if (canonical !== aiMirror) {
  failures.push('canonical ULTRATHINK skill and .ai mirror differ');
}

for (const phrase of [
  'version: 1.1.0',
  'ATTACK N law',
  'reasoning-pressure budget',
  'never permission',
  'TRUE-first and bad-state gate',
  'Never continue building over a known bad, broken, stale, failing, or bugged state.',
  'Supabase specialization',
  '2026-09-27',
  '2026-10-30',
  'Organization membership is not project/runtime authority.',
  'trace_id',
  'Prefer server-side subscription filters',
  'security and performance advisors',
  'PLAYWRIGHT WHEN BROWSER-OBSERVABLE',
  'CONTINUITY RECEIPT + SUCCESSOR FINGERPRINT',
]) requireText('canonical ULTRATHINK contract', canonical, phrase);

for (const phrase of [
  'ATTACK N',
  'Do not build forward over a known bad, broken, stale, failing, or bugged state',
  'Supabase specialization',
  '2026-09-27',
  '2026-10-30',
  'W3C `trace_id`',
  'bounded Realtime filters',
  'TRUE-FIRST → ULTRATHINK → ATTACK N',
]) requireText('Claude ULTRATHINK entrypoint', claudeEntry, phrase);

if (contract.schema !== 'juss/ultrathink-attack-workflow@v2') failures.push('wrong contract schema');
if (contract.authorityRepository !== 'jussray/founder-control-room') failures.push('wrong authority repository');
if (contract.canonicalSkill !== 'skills/ultrathink-devil/SKILL.md') failures.push('wrong canonical skill path');
requireArrayIncludes('contract mirror', contract.mirrors, '.ai/skills/ultrathink-devil/SKILL.md');
requireArrayIncludes('contract mirror', contract.mirrors, '.claude/skills/ultrathink/SKILL.md');

for (const [label, value] of [
  ['TRUE-first', contract.truth?.trueFirst],
  ['fingerprint before mutation', contract.truth?.fingerprintBeforeMaterialMutation],
  ['continuity markers non-authorizing', contract.truth?.continuityMarkersAuthorizeNothing],
  ['known bad state gate', contract.truth?.knownBadStateBlocksForwardBuild],
  ['repair before queued work', contract.truth?.repairOrRevertBeforeQueuedWork],
  ['successor fingerprint', contract.truth?.successorFingerprintRequiredAfterRepair],
  ['ATTACK budget semantics', contract.attackN?.numericLabelIsReasoningPressureBudget],
  ['ATTACK dedupe', contract.attackN?.deduplicateFailureClasses],
  ['ATTACK authority boundary', contract.attackN?.largerBudgetNeverWidensAuthority],
  ['ATTACK patch boundary', contract.attackN?.largerBudgetNeverRequiresLargerPatch],
  ['Supabase immutable project identity', contract.supabase?.projectIdentityUsesImmutableProjectRef],
  ['Supabase email evidence clock', contract.supabase?.emailIsTimestampedHistoricalProviderEvidence],
  ['Supabase live lifecycle proof', contract.supabase?.liveProviderReadbackRequiredForCurrentLifecycleClaimWhenAvailable],
  ['Supabase lifecycle-before-code', contract.supabase?.resolvePausedDegradedOrInaccessibleBeforeDependentCodeDebugging],
  ['Supabase org membership separation', contract.supabase?.organizationMembershipIsNotRuntimeAuthority],
  ['Supabase OAuth authority separation', contract.supabase?.oauthApprovalIsNotDatabaseMutationAuthority],
  ['Supabase auth/service-role separation', contract.supabase?.userAuthenticationIsNotServiceRoleAuthority],
  ['Supabase explicit Data API decision', contract.supabase?.migrationGrantContract?.newPublicTableRequiresExplicitDataApiDecision],
  ['Supabase RLS separate control', contract.supabase?.migrationGrantContract?.rlsIsSeparateControl],
  ['Supabase schema readback', contract.supabase?.ddlProof?.focusedSchemaReadback],
  ['Supabase security advisor', contract.supabase?.ddlProof?.securityAdvisor],
  ['Supabase performance advisor', contract.supabase?.ddlProof?.performanceAdvisor],
  ['Supabase trace capture', contract.supabase?.traceContinuity?.captureW3CTraceIdWhenAvailable],
  ['Supabase Realtime filters', contract.supabase?.realtimeEfficiency?.preferServerSideFilters],
  ['Supabase Realtime column minimization', contract.supabase?.realtimeEfficiency?.selectOnlyNeededColumns],
  ['Supabase least privilege', contract.supabase?.credentialScope?.leastPrivilege],
  ['Supabase scoped credentials', contract.supabase?.credentialScope?.scopeByOrganizationProjectPermissionWhenSupported],
  ['FCR control/evidence plane', contract.supabase?.projectSeparation?.fcrIsPortfolioControlEvidencePlane],
  ['product-owned data', contract.supabase?.projectSeparation?.productDataRemainsProductOwned],
  ['browser proof', contract.completion?.browserObservableClaimsRequirePlaywright],
]) requireTrue(label, value);

for (const [label, value] of [
  ['ATTACK does not claim external test count', contract.attackN?.externalTestCountClaimed],
  ['trace id creates no authority', contract.supabase?.traceContinuity?.traceIdCreatesAuthority],
  ['trace id proves no business outcome', contract.supabase?.traceContinuity?.traceIdProvesBusinessOutcome],
  ['portfolio god credential default', contract.supabase?.credentialScope?.portfolioWideGodCredentialByDefault],
  ['cross-project service role default', contract.supabase?.projectSeparation?.crossProjectSharedServiceRoleByDefault],
]) requireFalse(label, value);

for (const step of [
  'true-first-baseline',
  'ultrathink',
  'attack-n',
  'lindy',
  'red-team-i',
  'l99-decide',
  'goalfix',
  'red-team-ii',
  'proofmode',
  'truthmode-confess',
  'playwright-when-browser-observable',
  'continuity',
  'ooda-next-gate',
]) requireArrayIncludes('workflow', contract.workflow, step);

for (const role of ['anon', 'authenticated', 'service_role']) {
  requireArrayIncludes('Supabase migration roles', contract.supabase?.migrationGrantContract?.roles, role);
}

const migrationThreshold = contract.supabase?.migrationGrantContract?.enforceForMigrationTimestampAtOrAfter;
if (!/^\d{14}$/.test(migrationThreshold ?? '')) failures.push('invalid migration enforcement timestamp');

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n\r]*/g, ' ');
}

function normalizeSql(sql) {
  return stripSqlComments(sql).replace(/\s+/g, ' ').trim().toLowerCase();
}

function collectCreatedPublicTables(sql) {
  const tables = new Set();
  const normalized = normalizeSql(sql);
  const pattern = /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:(?:public)\s*\.\s*)?"?([a-z_][a-z0-9_$]*)"?/g;
  for (const match of normalized.matchAll(pattern)) tables.add(match[1]);
  return [...tables];
}

function tableAccessStatementMentionsRole(sql, table, role) {
  const normalized = normalizeSql(sql);
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const roleEscaped = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const statements = normalized.split(';');
  return statements.some(statement => {
    if (!/\b(grant|revoke)\b/.test(statement)) return false;
    const targetsTable = new RegExp(`\\bon\\s+(?:table\\s+)?(?:public\\s*\\.\\s*)?"?${escaped}"?\\b`).test(statement);
    if (!targetsTable) return false;
    return new RegExp(`\\b${roleEscaped}\\b`).test(statement);
  });
}

function enablesRls(sql, table) {
  const normalized = normalizeSql(sql);
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\s*\\.\\s*)?"?${escaped}"?\\s+enable\\s+row\\s+level\\s+security\\b`).test(normalized);
}

const migrationsDirectory = path.join(root, 'supabase', 'migrations');
const migrationFiles = (await readdir(migrationsDirectory))
  .filter(file => /^\d{14}_.+\.sql$/.test(file))
  .sort();

let governedNewTables = 0;
for (const file of migrationFiles) {
  const timestamp = file.slice(0, 14);
  if (timestamp < migrationThreshold) continue;

  const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
  for (const table of collectCreatedPublicTables(sql)) {
    governedNewTables += 1;
    if (!enablesRls(sql, table)) {
      failures.push(`${file}: new public table ${table} must enable RLS in the same migration`);
    }
    for (const role of contract.supabase.migrationGrantContract.roles) {
      if (!tableAccessStatementMentionsRole(sql, table, role)) {
        failures.push(`${file}: new public table ${table} lacks explicit GRANT/REVOKE decision for ${role}`);
      }
    }
  }
}

if (failures.length) {
  console.error('ULTRATHINK / ATTACK workflow contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  contract: contract.schema,
  status: 'passed',
  attackBudgetIsReasoningPressure: contract.attackN.numericLabelIsReasoningPressureBudget,
  supabaseGrantEnforcementFrom: migrationThreshold,
  governedNewTables,
  canonicalMirrorExact: true,
}));
