import { execFileSync } from 'node:child_process';

const LAST_REVIEWED_MERGE = '34ffe99e77455f278b437f4cfc67c76e3df59a25';
const LAST_REVIEWED_TREE = '0dfa1ba952ae01908301af4748a0b04fa55b5eb5';
const INCIDENT_TIP = '027dfdd42f032a5c614c147ae9e1a824c2f506b9';
const INCIDENT_TREE = 'f12e305a953de062eab15143fa032d9e8c0e1fc8';

const EXPECTED_DIRECT_COMMITS = [
  '3b48e557e6f460fbcb46561bf350f7249e2430d9',
  '3562df9d5f3f751b54c107ff502a5cc3b6615664',
  'b5fc29cb8f51646e8d4c1c89fe84111e068d4c49',
  '5ac6d44bc42614fc7cccb20da1a8d4fe5008b710',
  'ccc0e88d3295d42f95d7f42e0225863bdb4a3e19',
  'd022ef600a3ae62bef796bfde9f521b33d63d1a9',
  '346f7498d7edfb97294f810e43b39edd3f6b62d3',
  '832512394d258c52648f8160b0e9eb2126af4f39',
  '027dfdd42f032a5c614c147ae9e1a824c2f506b9',
];

const EXPECTED_RANGE_FILES = [
  'AGENTS_FOUNDER_INTELLIGENCE.md',
  'docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md',
  'docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md',
  'docs/FCR_SINGLE_OS_COHESION_AUDIT.md',
  'docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_4_ADDENDUM.md',
  'docs/PHASE_0_SELF_ATTACK_TRUTH_MAP_2026-09-08.md',
  'scripts/pr-continuity.mjs',
  'scripts/verify-founder-intelligence-inheritance.mjs',
  'src/approvals/approval.ts',
  'src/chief/firstSliceContracts.ts',
  'src/content/publicClaimGate.ts',
  'src/implant/__tests__/selfAttackContracts.test.ts',
  'src/implant/contracts.ts',
  'src/lib/__tests__/agentInterop.test.ts',
  'src/lib/__tests__/agentRegistry.test.ts',
  'src/lib/agentInterop.ts',
  'src/lib/agentRegistry.ts',
  'src/model/execution.ts',
  'src/provider/manifest.ts',
  'src/state/machines.ts',
  'src/truth/truth.ts',
  'test/pr-continuity.attack20.test.mjs',
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

const shallow = git('rev-parse', '--is-shallow-repository');
if (shallow !== 'false') {
  throw new Error('Historical ratification requires a full Git history checkout; shallow history cannot prove the incident range');
}

const anchorTree = git('show', '-s', '--format=%T', LAST_REVIEWED_MERGE);
if (anchorTree !== LAST_REVIEWED_TREE) {
  throw new Error(`Reviewed-merge tree mismatch: expected ${LAST_REVIEWED_TREE}, got ${anchorTree}`);
}

const incidentTree = git('show', '-s', '--format=%T', INCIDENT_TIP);
if (incidentTree !== INCIDENT_TREE) {
  throw new Error(`Incident-tip tree mismatch: expected ${INCIDENT_TREE}, got ${incidentTree}`);
}

const commits = lines(git('rev-list', '--reverse', '--first-parent', `${LAST_REVIEWED_MERGE}..${INCIDENT_TIP}`));
equalList(commits, EXPECTED_DIRECT_COMMITS, 'Direct-main first-parent sequence');

const files = lines(git('diff', '--name-only', LAST_REVIEWED_MERGE, INCIDENT_TIP)).sort();
equalList(files, [...EXPECTED_RANGE_FILES].sort(), 'Direct-main affected file set');

execFileSync('git', ['merge-base', '--is-ancestor', INCIDENT_TIP, 'HEAD'], { stdio: 'ignore' });

const receipt = {
  kind: 'fcr/main-release-historical-ratification@v1',
  ok: true,
  lastReviewedMerge: LAST_REVIEWED_MERGE,
  lastReviewedTree: LAST_REVIEWED_TREE,
  incidentTip: INCIDENT_TIP,
  incidentTree: INCIDENT_TREE,
  directCommitCount: EXPECTED_DIRECT_COMMITS.length,
  affectedFileCount: EXPECTED_RANGE_FILES.length,
  candidateHead: git('rev-parse', 'HEAD'),
  historicalProvenanceRelabeled: false,
  mergeAuthorityGranted: false,
  deployAuthorityGranted: false,
};

process.stdout.write(`${JSON.stringify(receipt)}\n`);
