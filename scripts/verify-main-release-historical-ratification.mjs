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
  {
    id: 'direct-main-after-pr-778',
    anchorCommit: 'f4e0439da4f43ef980e10eaf39b75e8d6bff21f8',
    anchorTree: '8f881059b8bb40a460c274bcdedcf2ae502f2420',
    incidentTip: '6dd040c6421663c72050cf3db63042320072096c',
    incidentTree: '54eff0f2063350dc139aebad76d2dd1c0778ce70',
    directCommits: [
      '61411a7651c1589738ba88b20a11937f22003343',
      '2e346a8dbb55fbd423d2ebd7c817f091c5f10924',
      'bfe78a978ddc0a2a9fc9bc60fd43f464a39806d9',
      'e0ac4576da3d66436be67731220d6b63acf838b3',
      'd99f7f639c89cdff7e7d9ba6c9f76723f1b58f41',
      '62358663d1215d8bd3df4dba2faee1ee2b0a0bab',
      '4af3109e3f84f2dc8f19a8ec159b6ebe037ea758',
      '24c457fbfcf8406487c1504cf34cd2b4278049ab',
      'dd740ecaceb684bb0478ecffd8778dba0deb0d53',
      'fb72627ab351c70feb0afbf2c3c3959903c48aa1',
      '0bfe2dfddeded56e7629b57ead9a9562e0842834',
      '0130111347a74386ddc0fb1ae7f1099ccb8ab8b9',
      '55ed2c22e213768f4e8ae9912e186c72e2948020',
      '622ab1d3e37b5e5aefa6343427fa5378f9dc83cf',
      '625704f8d75e076ef9c30b20214b280a30f618b3',
      'c6611b08176ef887a61ea3ef0b7cafab443c1402',
      '612159e876051eb05493e50af9562899b60a6bd6',
      '81d05f7ae8f427e84db506cfa726520a8178dece',
      'f9f1d671cfb701925b90c2c5a7cd21efe4ab294f',
      '6dd040c6421663c72050cf3db63042320072096c',
    ],
    affectedFiles: [
      '.agents/skills/control-room-cloudflare-agent-fleet/SKILL.md',
      '.control-room/plugin-management.json',
      '.github/mcp.json',
      'e2e/security-posture-proof.mjs',
      'public/control-room/security.css',
      'public/control-room/security.js',
      'scripts/verify-ai-skill-contract.mjs',
      'skills/portfolio-control-plane/SKILL.md',
      'src/founder-os-lab/__tests__/pluginManagement.contract.test.ts',
      'src/http/routes/securityPosture.test.ts',
      'src/security/cryptographicInventory.ts',
      'src/security/securityPosture.test.ts',
      'src/security/securityPosture.ts',
      'src/security/strategicSecurity.test.ts',
      'src/security/strategicSecurity.ts',
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
