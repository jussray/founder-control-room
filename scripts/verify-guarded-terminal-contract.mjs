import {readFile} from 'node:fs/promises';

const files = {
  mission: await readFile(new URL('../src/controllers/MissionController.ts', import.meta.url), 'utf8'),
  approvals: await readFile(new URL('../src/http/routes/approvals.ts', import.meta.url), 'utf8'),
  terminalRoute: await readFile(new URL('../src/http/routes/terminal.ts', import.meta.url), 'utf8'),
  runner: await readFile(new URL('../src/terminal/runner.ts', import.meta.url), 'utf8'),
  registry: await readFile(new URL('../src/terminal/registry.ts', import.meta.url), 'utf8'),
  evidenceTypes: await readFile(new URL('../src/reconciliation/types.ts', import.meta.url), 'utf8'),
  migration: await readFile(new URL('../supabase/migrations/20260717_guarded_terminal.sql', import.meta.url), 'utf8'),
};

const failures = [];

function requireText(label, source, expected) {
  if (!source.includes(expected)) {
    failures.push(`${label}: missing required contract text ${JSON.stringify(expected)}`);
  }
}

function forbidText(label, source, forbidden) {
  if (source.includes(forbidden)) {
    failures.push(`${label}: forbidden stale or unsafe text ${JSON.stringify(forbidden)}`);
  }
}

requireText('MissionController', files.mission, 'branch_ref');
requireText('MissionController', files.mission, 'expectedHeadSha');
forbidText('MissionController', files.mission, 'branch_name');
forbidText('MissionController', files.mission, "'implementing'");
forbidText('MissionController', files.mission, "'awaiting_approval'");
forbidText('MissionController', files.mission, "'verifying'");

requireText('Approvals', files.approvals, 'verifyExactHeadEvidence');
requireText('Approvals', files.approvals, 'resolveRef');
requireText('Approvals', files.approvals, 'expectedHeadSha');
requireText('Approvals', files.approvals, "mission.status !== 'approved'");
forbidText('Approvals', files.approvals, 'connection_config');
forbidText('Approvals', files.approvals, "eq('provider'");
forbidText('Approvals', files.approvals, 'branch_name');

requireText('Terminal route', files.terminalRoute, "CONTROL_ROOM_TERMINAL_ENABLED");
requireText('Terminal route', files.terminalRoute, "CONTROL_ROOM_TERMINAL_ALLOW_REMOTE");
requireText('Terminal route', files.terminalRoute, 'expectedCommitSha');
requireText('Terminal route', files.terminalRoute, 'outputTruncated');
requireText('Terminal route', files.terminalRoute, "status: proofEligible ? 'pass'");

requireText('Terminal runner', files.runner, 'shell: false');
requireText('Terminal runner', files.runner, 'realpath');
requireText('Terminal runner', files.runner, 'this.terminate');
forbidText('Terminal runner', files.runner, 'shell: true');
forbidText('Terminal runner', files.runner, "spawn('bash'");
forbidText('Terminal runner', files.runner, "spawn('sh'");

requireText('Terminal registry', files.registry, 'playwright@${PLAYWRIGHT_VERSION}');
requireText('Terminal registry', files.registry, "'deps.playwright-browser'");
forbidText('Terminal registry', files.registry, "'bash'");
forbidText('Terminal registry', files.registry, "'sh'");
forbidText('Terminal registry', files.registry, "'powershell'");

requireText('Evidence types', files.evidenceTypes, "'browser_test'");

requireText('Migration', files.migration, 'create table if not exists terminal_runs');
requireText('Migration', files.migration, 'terminal_runs_one_active_per_project');
requireText('Migration', files.migration, "'juss-beautiful-hair-private'");
requireText('Migration', files.migration, 'alter table terminal_runs enable row level security');

if (failures.length > 0) {
  console.error('Guarded terminal contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Guarded terminal contract passed.');
