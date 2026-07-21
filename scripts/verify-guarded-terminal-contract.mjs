import {readFile} from 'node:fs/promises';

const files = {
  mission: await readFile(new URL('../src/controllers/MissionController.ts', import.meta.url), 'utf8'),
  approvals: await readFile(new URL('../src/http/routes/approvals.ts', import.meta.url), 'utf8'),
  terminalRoute: await readFile(new URL('../src/http/routes/terminal.ts', import.meta.url), 'utf8'),
  runner: await readFile(new URL('../src/terminal/runner.ts', import.meta.url), 'utf8'),
  registry: await readFile(new URL('../src/terminal/registry.ts', import.meta.url), 'utf8'),
  githubProvider: await readFile(new URL('../src/providers/GitHubProvider.ts', import.meta.url), 'utf8'),
  evidenceTypes: await readFile(new URL('../src/reconciliation/types.ts', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  localWorkspace: await readFile(new URL('../scripts/verify-local-workspace.mjs', import.meta.url), 'utf8'),
  localWorkspaceDocs: await readFile(new URL('../docs/LOCAL_WORKSPACE.md', import.meta.url), 'utf8'),
  localWorkspaceUx: await readFile(new URL('../docs/product-design/LOCAL_WORKSPACE_MISSION_UX.md', import.meta.url), 'utf8'),
  migration: await readFile(
    new URL('../supabase/migrations/20260717195000_guarded_terminal_and_schema_reconciliation.sql', import.meta.url),
    'utf8',
  ),
};

const failures = [];

function requireText(label, source, expected) {
  if (!source.includes(expected)) {
    failures.push(`${label}: missing required contract text ${JSON.stringify(expected)}`);
  }
}

function requireCount(label, source, expected, minimum) {
  const count = source.split(expected).length - 1;
  if (count < minimum) {
    failures.push(
      `${label}: expected at least ${minimum} occurrences of ${JSON.stringify(expected)}, found ${count}`,
    );
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
requireText('Approvals', files.approvals, "status: 'pending'");
requireText('Approvals', files.approvals, "status: executionError ? 'failed' : 'succeeded'");
requireText('Approvals', files.approvals, 'ACTION_AUDIT_INCOMPLETE');
forbidText('Approvals', files.approvals, 'connection_config');
forbidText('Approvals', files.approvals, "eq('provider'");
forbidText('Approvals', files.approvals, 'branch_name');

requireText('Terminal route', files.terminalRoute, 'CONTROL_ROOM_TERMINAL_ENABLED');
requireText('Terminal route', files.terminalRoute, 'CONTROL_ROOM_TERMINAL_ALLOW_REMOTE');
requireText('Terminal route', files.terminalRoute, 'expectedCommitSha');
requireText('Terminal route', files.terminalRoute, 'missionExpectedHeadSha');
requireText('Terminal route', files.terminalRoute, 'MISSION_HEAD_MISMATCH');
requireText('Terminal route', files.terminalRoute, 'COMMAND_NOT_ALLOWED_IN_MISSION_STATE');
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
requireText('Terminal registry', files.registry, "'verify.terminal-contract'");
requireCount('Terminal registry', files.registry, "'verify.ai-skills'", 4);
requireCount('Terminal registry', files.registry, "evidenceKind: 'artifact_provenance'", 4);
requireText('Terminal registry', files.registry, "['run', 'verify:ai-skills']");
requireText('Terminal registry', files.registry, "['run', 'verify:ai-skill-contract']");
forbidText('Terminal registry', files.registry, "'bash'");
forbidText('Terminal registry', files.registry, "'sh'");
forbidText('Terminal registry', files.registry, "'powershell'");

requireText('GitHub provider', files.githubProvider, 'resolvedRefs');
requireText('GitHub provider', files.githubProvider, 'head: exactHeadSha');
requireText('GitHub provider', files.githubProvider, 'this.resolvedRefs.delete(key)');
requireText('GitHub provider', files.githubProvider, 'requires resolveRef');

requireText('Evidence types', files.evidenceTypes, "'browser_test'");
requireText('Evidence types', files.evidenceTypes, "'artifact_provenance'");

requireText('Package scripts', files.packageJson, 'verify:local-workspace');
requireText('Local workspace preflight', files.localWorkspace, 'CONTROL_ROOM_WORKSPACE_ROOT');
requireText('Local workspace preflight', files.localWorkspace, 'jbh-private');
requireText('Local workspace preflight', files.localWorkspace, 'jussbeautifulhair-site');
requireText('Local workspace preflight', files.localWorkspace, 'untold-stories-storefront');
requireText('Local workspace preflight', files.localWorkspace, 'a77bdcd4314eb9753da6354ffd35d17df5ba6927');
requireText('Local workspace preflight', files.localWorkspace, '9444483d63d1d10823b80323f3b4c796b444be0c');
requireText('Local workspace preflight', files.localWorkspace, 'eb23d6e364a483b28e0ea8d6577d050b293b9930');
requireText('Local workspace preflight', files.localWorkspace, 'private checkout');
requireText('Local workspace preflight', files.localWorkspace, 'must not be nested inside the public Control Room repository');
requireText('Local workspace preflight', files.localWorkspace, "spawn('git'");
requireText('Local workspace preflight', files.localWorkspace, 'shell: false');
forbidText('Local workspace preflight', files.localWorkspace, "spawn('bash'");
forbidText('Local workspace preflight', files.localWorkspace, "spawn('sh'");

requireText('Local workspace docs', files.localWorkspaceDocs, 'Private repositories must never be copied or nested');
requireText('Local workspace docs', files.localWorkspaceDocs, 'A passing preflight is not mission evidence by itself');
requireText('Local workspace docs', files.localWorkspaceDocs, 'CONTROL_ROOM_TERMINAL_ALLOW_REMOTE=false');
requireText('Local workspace docs', files.localWorkspaceDocs, 'No approval carries forward');

requireText('Local workspace UX', files.localWorkspaceUx, 'Use a cockpit, not a wizard');
requireText('Local workspace UX', files.localWorkspaceUx, 'Workspace is ready. This is not mission proof');
requireText('Local workspace UX', files.localWorkspaceUx, 'Never label `steps: null` as a code failure');
requireText('Local workspace UX', files.localWorkspaceUx, 'Separate approval required');
requireText('Local workspace UX', files.localWorkspaceUx, 'This flow does not authorize merge, deployment, pricing, outreach, spending, checkout changes, refunds, customer communication, vendor access, customer data access, credential access, or making private repositories public.');

requireText('Migration', files.migration, 'create table if not exists approval_executions');
requireText('Migration', files.migration, "status in ('pending', 'succeeded', 'failed')");
requireText('Migration', files.migration, 'change_proposals_provider_pr_dedup');
requireText('Migration', files.migration, 'releases_provider_deployment_dedup');
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
