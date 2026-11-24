/**
 * Candidate discovery only. This registry never installs, executes, or grants
 * permissions to third-party code. The existing capability kernel remains authoritative.
 */
type Destination = 'fcr' | 'chief' | 'promptos' | 'skills-library' | 'medusa';
type Candidate = readonly [id: string, repository: string, category: string, destinations: readonly Destination[]];
const CANDIDATES: readonly Candidate[] = [
  ['mattpocock-skills', 'mattpocock/skills', 'engineering', ['promptos', 'fcr']],
  ['ecc', 'affaan-m/ECC', 'engineering', ['chief', 'fcr']],
  ['superpowers', 'obra/superpowers', 'engineering', ['chief', 'fcr']],
  ['ponytail', 'DietrichGebert/ponytail', 'engineering', ['chief', 'fcr']],
  ['agent-skills', 'addyosmani/agent-skills', 'engineering', ['promptos', 'fcr']],
  ['graphify', 'Graphify-Labs/graphify', 'context', ['fcr', 'chief']],
  ['headroom', 'headroomlabs-ai/headroom', 'context', ['chief']],
  ['claude-mem', 'thedotmack/claude-mem', 'context', ['chief']],
  ['repomix', 'yamadashy/repomix', 'context', ['fcr', 'chief']],
  ['taste-skill', 'Leonxlnx/taste-skill', 'design', ['promptos', 'fcr']],
  ['impeccable', 'pbakaus/impeccable', 'design', ['promptos', 'fcr']],
  ['humanizer', 'blader/humanizer', 'writing', ['promptos']],
  ['last30days-skill', 'mvanhorn/last30days-skill', 'research', []],
  ['marketingskills', 'coreyhaines31/marketingskills', 'marketing', ['promptos']],
  ['skillspector', 'NVIDIA/SkillSpector', 'security', ['medusa']],
];
// Observed review targets; not approved or installed revisions.
const REVIEW_PINS: Readonly<Record<string, string>> = {
  "mattpocock-skills": "abeeaf95660ba9e8b7c753eb38f441ca707a8823",
  "ecc": "4adeee6732a12d1540f49a4d50a38ce8c97f9a53",
  "superpowers": "22f0b463e7a5e579904dd6211a520321035526f7",
  "ponytail": "ebd8654c2c627f721eb8f9c0d1bd4090a29f9e10",
  "agent-skills": "e997ac5b9a74eab332d5e9793bb38a38c8cfdd74",
  "graphify": "013a6461c31da6e003c0dea191aca84c94cb8d47",
  "headroom": "8614305b7913cec8449fae9e6fe88d2fa7b30286",
  "claude-mem": "2c57eb156ee726c8f0f22502cc9bfcc0a8353526",
  "repomix": "7bde93e34dee399488f0fa0a1f5b2c56deb9e510",
  "taste-skill": "6c0b5c78f5d31776e2210305abaa210cdc0030bf",
  "impeccable": "b49177d32788f2dc585c42831d845dacf1ebed2c",
  "humanizer": "a32f24407364c74c812b43c15926d638bee1e072",
  "marketingskills": "8fd2fcade2fd6629026e9dfe6d133b55b36968b9",
  "skillspector": "0205488a8257869cac3054397ddd5a5d29180aab"
};
const REQUIRED_GATES = [
  'pin-revision', 'license-review', 'security-review', 'sandbox-proof',
  'runtime-compatibility', 'founder-approval'
] as const;

function toRecord([id, repository, category, destinations]: Candidate) {
  return {
    id, repository, source: id === 'last30days-skill' ? null : 'https://github.com/' + repository, category,
    destinations: [...destinations, 'skills-library' as const],
    state: 'QUARANTINED' as const,
    reviewRevision: REVIEW_PINS[id] ?? null,
    revision: null, license: null,
    executionAllowed: false as const,
    requiredGates: [...REQUIRED_GATES],
  };
}
export function listExternalSkills(destination?: Destination) {
  const rows = CANDIDATES.map(toRecord);
  return destination === undefined ? rows : rows.filter(row => row.destinations.includes(destination));
}
export function inspectExternalSkill(id: string) {
  const candidate = CANDIDATES.find(row => row[0] === id);
  return candidate === undefined ? null : toRecord(candidate);
}
