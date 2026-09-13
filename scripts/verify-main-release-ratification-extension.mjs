import { execFileSync } from 'node:child_process';

const ANCHOR_COMMIT = '1143b2757ddb257019b62db7c31e6e19bc32c61a';
const ANCHOR_TREE = '82e370ec22cedbb941288af593393ee502fb4a58';
const INCIDENT_TIP = 'cad41a5880b213d31242812906a24203e6131929';
const INCIDENT_TREE = '3e227bc2c51cd75c66a0aa20ecfbb17ed97438a0';

const FIRST_PARENT_COMMITS = [
  '88ca9b7a70bbea278493d32635a2a821c120d282',
  'b9060f81999f19ed4d8413375bebe9634e22afe8',
  '0500331d7ff2694bbf6a55c03eefb959027143fa',
  '46b1908e89ee50c9c1da0f67d04200df8982d269',
  'e2a92c0377af61c400faf46bdaf2ab89bd95dbd1',
  'eedcb45d03ebd2b53428860bd7ef0210af602072',
  '1592fa9a2658e6e32a06fb6d0cf8d775632e061d',
  '603e2bdef67e5e3fe0ef37ec122b8a2893283bb5',
  '2a2391965341151e998c74024a878361679dc02d',
  '4d8f7cb715f837fd82cd6d3e32fced2ab9e498ad',
  'd0eb36bf891d44fbf6dee4a3b0dd8ace8dbb7fc1',
  'c90aedacf4263acc0c4e02147ed19c48c95c5306',
  '8de3600f273c7c427cfd908bbf42a756bd912463',
  '23a076f8abc1cfa53cfae29f90c64bef14cb5f42',
  'd23f28760c3de5fe53ba002aaf370334a8827f1f',
  '0436eff8d91ae4c1676d8905bf0609fb2301343c',
  '1ac8fde03827f9fc8b22c9c04d46a5fa27ff2866',
  '4d3fc1efad9b0b01a3743ffd234c4d5796fe874a',
  '607465d4b4d0f1fb71995ee1a5488d9480a70343',
  'de3d236702aca0448737395398f7043267ef18ac',
  '0d4e62c99253079439b88d9478fb3cd3ebec3015',
  'ca630780bfa90555e911ef338d8db2ef40fbc98d',
  '6f2495e8def6f76f4d55bc46827fbd6eebaf78d8',
  'f78cac4ac16fe74bd30351efb54543b07bd6a4e8',
  '211df15a99cfb30aa1447285168c67998bf7971a',
  'b8c6c045b3b59317c7c2653d2c7a4bc1eb8e5727',
  '166d0651273f030be015cdaf09f110edc840afcd',
  '0d36d9dcd5fb3055557f7ca9c5b7e0959bb60072',
  '4d58516a87f573838400649703dd1b4444b6d02f',
  'a344950da92620226ba5dd939446ace7f3c1cc1c',
  'ca44781ad724deffbfd486a3c3dc402a022d9b55',
  '531858f6c6a0922c971649dd9f39d1a8f50a5f03',
  '87266b406604f7c3b182a68f51590b9514e620be',
  'f78e209fa07ea6630a92a3cd7ea0d6526a8b61ff',
  '2ca0420477ea4a7df9f35a74214124f13a972cd9',
  '0e69422b1a0e02413202118357025a6448169a55',
  'c63863fa0e981712f9589381c3dfc4f9206040e8',
  'f58def72c63c243512caef2b4d9032ca6c57d6de',
  '8ec21bdeb8ad76095d3caca6a557fc06e5ca2515',
  '321d22407a1f5e190aea433f134704a5337f9d44',
  '228267e21e075f0060ecc641d639123137a263e8',
  '1fe421b533f8ef0bfc3ab132d86d6e8dcd8ae52c',
  'c0b6f229a0bd8559ee1a2aa630488b93a421b53e',
  '5deb8391814740dc2832a103bc7a1be568fa4749',
  '28409ad114a6fe059f3856e43a1f569fb2394677',
  'c33a05f31bc8112396448d12faec84e0bcceb2e0',
  'cad41a5880b213d31242812906a24203e6131929',
];

const AFFECTED_FILES = [
  '.ai/skills/juss-flow-launch-loop/SKILL.md',
  '.control-room/plugin-management.json',
  '.cursor/mcp.json',
  '.env.example',
  '.github/workflows/capability-contract.yml',
  '.github/workflows/ci.yml',
  '.mcp.example.json',
  '.mcp.json',
  '.vscode/mcp.json',
  'GLOBAL_AI.md',
  'README.md',
  'config/agent-fleet/opencode.jsonc',
  'config/agent-fleet/windsurf-mcp_config.json',
  'config/mcp-skill-routing.json',
  'docs/CLOUDFLARE_REASONING.md',
  'docs/DOCUMENTATION_TRUTH_RECEIPT.json',
  'docs/FOUNDER_MERGE_AUTHORITY.md',
  'docs/MCP_STACK.md',
  'docs/PR_CONTINUITY.md',
  'docs/SECRETS.md',
  'docs/TINYFISH_READONLY_CAPABILITY.md',
  'docs/deployment/CLOUDFLARE_WORKER_TARGETS.md',
  'scripts/linkedin_analytics_continuity.py',
  'scripts/pr-continuity.mjs',
  'scripts/test_linkedin_analytics_continuity.py',
  'scripts/verify-mcp-config.mjs',
  'scripts/verify-production-deploy-authority.mjs',
  'security/portfolio-worker-security.json',
  'src/capabilities/__tests__/bubbleLabShadow.test.ts',
  'src/capabilities/__tests__/tinyFishWebObservation.test.ts',
  'src/capabilities/bubbleLabShadow.ts',
  'src/capabilities/freeFirstCapabilityPolicy.ts',
  'src/capabilities/tinyFishWebObservation.ts',
  'src/founder-os-lab/__tests__/socialAnalyticsIdentity.contract.test.ts',
  'src/founder-os-lab/federatedRelayV3.ts',
  'src/http/routes/__tests__/tinyFishObservation.integration.test.ts',
  'src/http/routes/capabilities.ts',
  'src/http/routes/federatedRelayV3.ts',
  'src/http/server.ts',
  'src/lib/__tests__/founderDeployCommand.contract.test.ts',
  'src/quickscan/__tests__/chiefOpenaiClient.test.ts',
  'src/quickscan/chiefOpenaiClient.ts',
  'supabase/migrations/20260913180000_federated_relay_v3.sql',
  'supabase/migrations/20260913180110_federated_relay_v3.sql',
  'supabase/migrations/20260913180339_federated_relay_v3_fk_indexes.sql',
  'test/pr-continuity.attack20.test.mjs',
  'wrangler.worker.toml',
];

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function lines(value) {
  return value ? value.split(/\r?\n/).filter(Boolean) : [];
}

function equalList(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} mismatch\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(actual)}`);
  }
}

if (git('rev-parse', '--is-shallow-repository') !== 'false') {
  throw new Error('Historical ratification extension requires full Git history');
}

const predecessor = JSON.parse(execFileSync(
  process.execPath,
  ['scripts/verify-main-release-historical-ratification.mjs'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
));

if (!predecessor.ok) {
  throw new Error('Predecessor historical ratification is not valid');
}

const predecessorTip = predecessor.incidents?.at(-1)?.incidentTip;
if (predecessorTip !== ANCHOR_COMMIT) {
  throw new Error(`Unexpected predecessor ratification tip: ${predecessorTip || 'missing'}`);
}

if (git('show', '-s', '--format=%T', ANCHOR_COMMIT) !== ANCHOR_TREE) {
  throw new Error('Ratification extension anchor tree mismatch');
}
if (git('show', '-s', '--format=%T', INCIDENT_TIP) !== INCIDENT_TREE) {
  throw new Error('Ratification extension tip tree mismatch');
}

const commits = lines(git('rev-list', '--reverse', '--first-parent', `${ANCHOR_COMMIT}..${INCIDENT_TIP}`));
equalList(commits, FIRST_PARENT_COMMITS, 'main successor first-parent sequence');

const files = lines(git('diff', '--name-only', ANCHOR_COMMIT, INCIDENT_TIP)).sort();
equalList(files, AFFECTED_FILES, 'main successor affected file set');

execFileSync('git', ['merge-base', '--is-ancestor', ANCHOR_COMMIT, INCIDENT_TIP], { stdio: 'ignore' });
execFileSync('git', ['merge-base', '--is-ancestor', INCIDENT_TIP, 'HEAD'], { stdio: 'ignore' });

const extensionIncident = {
  id: 'main-first-parent-after-browser-recovery',
  anchorCommit: ANCHOR_COMMIT,
  anchorTree: ANCHOR_TREE,
  incidentTip: INCIDENT_TIP,
  incidentTree: INCIDENT_TREE,
  firstParentCommitCount: FIRST_PARENT_COMMITS.length,
  affectedFileCount: AFFECTED_FILES.length,
};

const receipt = {
  kind: 'fcr/main-release-historical-ratification@v3',
  ok: true,
  incidentCount: predecessor.incidentCount + 1,
  incidents: [...predecessor.incidents, extensionIncident],
  predecessorKind: predecessor.kind,
  directCommitCount: predecessor.directCommitCount,
  firstParentSuccessorCommitCount: FIRST_PARENT_COMMITS.length,
  affectedPathInstances: predecessor.affectedPathInstances + AFFECTED_FILES.length,
  extensionAffectedPathCount: AFFECTED_FILES.length,
  candidateHead: git('rev-parse', 'HEAD'),
  historicalProvenanceRelabeled: false,
  mergeAuthorityGranted: false,
  deployAuthorityGranted: false,
};

process.stdout.write(`${JSON.stringify(receipt)}\n`);
