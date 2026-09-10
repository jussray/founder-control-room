import { execFileSync } from 'node:child_process';

const INCIDENTS = [
  {
    id: 'direct-main-after-pr-765',
    anchorCommit: '34ffe99e77455f278b437f4cfc67c76e3df59a25',
    anchorTree: '0dfa1ba952ae01908301af4748a0b04fa55b5eb5',
    incidentTip: '027dfdd42f032a5c614c147ae9e1a824c2f506b9',
    incidentTree: 'f12e305a953de062eab15143fa032d9e8c0e1fc8',
    directCommits: [
      '3b48e557e6f460fbcb46561bf350f7249e2430d9',
      '3562df9d5f3f751b54c107ff502a5cc3b6615664',
      'b5fc29cb8f51646e8d4c1c89fe84111e068d4c49',
      '5ac6d44bc42614fc7cccb20da1a8d4fe5008b710',
      'ccc0e88d3295d42f95d7f42e0225863bdb4a3e19',
      'd022ef600a3ae62bef796bfde9f521b33d63d1a9',
      '346f7498d7edfb97294f810e43b39edd3f6b62d3',
      '832512394d258c52648f8160b0e9eb2126af4f39',
      '027dfdd42f032a5c614c147ae9e1a824c2f506b9',
    ],
    affectedFiles: [
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
    ],
  },
  {
    id: 'direct-main-after-pr-777',
    anchorCommit: '57e1ed8c2f21911d953587bfe8fe03cd92383a67',
    anchorTree: 'c39168199489c673f7f442221307c6791e413b89',
    incidentTip: 'b3b1d21ca0bf1f6929b155f188551de7e9977ee4',
    incidentTree: '349d276993cc56ccd0a088e543bd0228ffb18026',
    directCommits: [
      'f1a6f26e38bbc378d08b9002def0ceff34bf4396',
      'b3b1d21ca0bf1f6929b155f188551de7e9977ee4',
    ],
    affectedFiles: [
      '.control-room/plugin-management.json',
      'AGENTS_FOUNDER_INTELLIGENCE.md',
    ],
  },
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
  throw new Error('Historical ratification requires a full Git history checkout; shallow history cannot prove direct-main incident ranges');
}

for (const incident of INCIDENTS) {
  const anchorTree = git('show', '-s', '--format=%T', incident.anchorCommit);
  if (anchorTree !== incident.anchorTree) {
    throw new Error(`${incident.id} anchor tree mismatch: expected ${incident.anchorTree}, got ${anchorTree}`);
  }

  const incidentTree = git('show', '-s', '--format=%T', incident.incidentTip);
  if (incidentTree !== incident.incidentTree) {
    throw new Error(`${incident.id} incident-tip tree mismatch: expected ${incident.incidentTree}, got ${incidentTree}`);
  }

  const commits = lines(git('rev-list', '--reverse', '--first-parent', `${incident.anchorCommit}..${incident.incidentTip}`));
  equalList(commits, incident.directCommits, `${incident.id} first-parent sequence`);

  const files = lines(git('diff', '--name-only', incident.anchorCommit, incident.incidentTip)).sort();
  equalList(files, [...incident.affectedFiles].sort(), `${incident.id} affected file set`);

  execFileSync('git', ['merge-base', '--is-ancestor', incident.anchorCommit, incident.incidentTip], { stdio: 'ignore' });
  execFileSync('git', ['merge-base', '--is-ancestor', incident.incidentTip, 'HEAD'], { stdio: 'ignore' });
}

const directCommitCount = INCIDENTS.reduce((total, incident) => total + incident.directCommits.length, 0);
const affectedPathInstances = INCIDENTS.reduce((total, incident) => total + incident.affectedFiles.length, 0);
const uniqueAffectedPathCount = new Set(INCIDENTS.flatMap((incident) => incident.affectedFiles)).size;

const receipt = {
  kind: 'fcr/main-release-historical-ratification@v2',
  ok: true,
  incidentCount: INCIDENTS.length,
  incidents: INCIDENTS.map((incident) => ({
    id: incident.id,
    anchorCommit: incident.anchorCommit,
    anchorTree: incident.anchorTree,
    incidentTip: incident.incidentTip,
    incidentTree: incident.incidentTree,
    directCommitCount: incident.directCommits.length,
    affectedFileCount: incident.affectedFiles.length,
  })),
  directCommitCount,
  affectedPathInstances,
  uniqueAffectedPathCount,
  candidateHead: git('rev-parse', 'HEAD'),
  historicalProvenanceRelabeled: false,
  mergeAuthorityGranted: false,
  deployAuthorityGranted: false,
};

process.stdout.write(`${JSON.stringify(receipt)}\n`);
