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
  ['last30days-skill', 'mvanhorn/last30days-skill', 'research', ['promptos', 'chief']],
  ['marketingskills', 'coreyhaines31/marketingskills', 'marketing', ['promptos']],
  ['skillspector', 'NVIDIA/SkillSpector', 'security', ['medusa']],
];
const REQUIRED_GATES = [
  'pin-revision', 'license-review', 'security-review', 'sandbox-proof',
  'runtime-compatibility', 'founder-approval'
] as const;

function toRecord([id, repository, category, destinations]: Candidate) {
  return {
    id, repository, source: 'https://github.com/' + repository, category,
    destinations: [...destinations, 'skills-library' as const],
    state: 'QUARANTINED' as const,
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
