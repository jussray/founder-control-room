export const FCR_OS_REGISTRY_CONTRACT = 'juss/fcr-os-registry@v1' as const;
export const FCR_STANDING_COMMAND_REGISTRY_CONTRACT = 'juss/fcr-standing-command-registry@v1' as const;

export type FcrOperatingSystemId =
  | 'founder-control-room'
  | 'council-os'
  | 'preflight-os'
  | 'video-production-os'
  | 'media-router-os'
  | 'promptos'
  | 'design-os';

export type FcrStandingCommandKind = 'entrypoint' | 'workflow' | 'mode' | 'lens' | 'control';

export interface FcrOperatingSystemDescriptor {
  id: FcrOperatingSystemId;
  class: 'operating-system';
  parentId: FcrOperatingSystemId | null;
  northStar: string;
  identityLocked: true;
}

export interface FcrStandingCommandDescriptor {
  id: string;
  aliases: readonly string[];
  owningOs: FcrOperatingSystemId;
  dependentOsIds?: readonly FcrOperatingSystemId[];
  kind: FcrStandingCommandKind;
  autoTrigger: string;
  mayExecute: false;
}

export const FCR_OPERATING_SYSTEM_REGISTRY: readonly FcrOperatingSystemDescriptor[] = [
  {
    id: 'founder-control-room',
    class: 'operating-system',
    parentId: null,
    northStar: 'Preserve founder intent, authority, evidence, reversibility, and exact-state continuity across the portfolio.',
    identityLocked: true,
  },
  {
    id: 'council-os',
    class: 'operating-system',
    parentId: 'founder-control-room',
    northStar: 'Challenge material decisions from multiple bounded perspectives without expanding execution authority.',
    identityLocked: true,
  },
  {
    id: 'preflight-os',
    class: 'operating-system',
    parentId: 'founder-control-room',
    northStar: 'Fail closed on missing authority, stale state, weak evidence, hidden consequences, or absent rollback before consequential work.',
    identityLocked: true,
  },
  {
    id: 'video-production-os',
    class: 'operating-system',
    parentId: 'founder-control-room',
    northStar: 'Turn video intent into continuity-bound production, generation, assembly, retries, and final proof.',
    identityLocked: true,
  },
  {
    id: 'media-router-os',
    class: 'operating-system',
    parentId: 'founder-control-room',
    northStar: 'Route and store media with provenance while leaving claims, rights, and publication approval to domain authority.',
    identityLocked: true,
  },
  {
    id: 'promptos',
    class: 'operating-system',
    parentId: 'founder-control-room',
    northStar: 'Route prompts by lane and North Star, preserve lineage, and promote only evidence-backed outcomes.',
    identityLocked: true,
  },
  {
    id: 'design-os',
    class: 'operating-system',
    parentId: 'founder-control-room',
    northStar: 'Translate product intent into bounded editable design changes with exact rendered proof.',
    identityLocked: true,
  },
] as const;

export const FCR_ALWAYS_ON_STANDING_COMMAND_IDS = [
  'human',
  'futureyou',
  'truthmode',
  'confess',
  'ultrathink',
  'steal',
  'redteam',
  'lindymode',
  'l99',
  'ooda',
  'hormozi',
  'billgates',
  'elonmusk',
  'firstprinciples',
  'socrates',
  'antiadvice',
  'unlearn',
  'loop',
] as const;

export const FCR_STANDING_COMMAND_REGISTRY: readonly FcrStandingCommandDescriptor[] = [
  { id: 'ultrathink', aliases: ['/ultrathink', 'ultrathink', 'ultrathink/solutions'], owningOs: 'council-os', kind: 'mode', autoTrigger: 'substantial, multi-step, architecture, or consequential founder work', mayExecute: false },
  { id: 'truthmode', aliases: ['/truthmode', 'truthmode', '/truth'], owningOs: 'preflight-os', kind: 'mode', autoTrigger: 'audits, status claims, evidence checks, and factual reconciliation', mayExecute: false },
  { id: 'confess', aliases: ['/confess', 'confess'], owningOs: 'preflight-os', kind: 'mode', autoTrigger: 'self-audits, drift checks, uncertainty, and overclaim review', mayExecute: false },
  { id: 'redteam', aliases: ['/redteam', 'redteam', 'redteam i', 'redteam ii'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'material decisions and proposed fixes before and after selection', mayExecute: false },
  { id: 'lindymode', aliases: ['/lindymode', 'lindymode'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'architecture, dependency, durability, and reversible-change decisions', mayExecute: false },
  { id: 'ooda', aliases: ['/ooda', 'ooda'], owningOs: 'preflight-os', kind: 'workflow', autoTrigger: 'iterative observe-orient-decide-act-verify loops', mayExecute: false },
  { id: 'l99', aliases: ['/l99', 'l99'], owningOs: 'preflight-os', kind: 'mode', autoTrigger: 'authority, state, evidence, rollback, and compounding-value review', mayExecute: false },
  { id: 'goalfix', aliases: ['/goalfix', '/fixfast', '/repair-verify-merge', '/goal', 'goalfix'], owningOs: 'founder-control-room', kind: 'workflow', autoTrigger: 'focused repair, bug, regression, broken runtime, or failing proof', mayExecute: false },
  { id: 'attack', aliases: ['/attack', 'attack ten', 'attack against itself ten times', 'attack n'], owningOs: 'council-os', kind: 'mode', autoTrigger: 'explicit attack depth or adversarial stress-testing request', mayExecute: false },
  { id: 'makevideo', aliases: ['/makevideo', 'makevideo'], owningOs: 'video-production-os', dependentOsIds: ['media-router-os'], kind: 'entrypoint', autoTrigger: 'clear video, movie, reel, cinematic, shot, or video-generation intent', mayExecute: false },
  { id: 'leevize', aliases: ['/leevize', 'leevize'], owningOs: 'video-production-os', dependentOsIds: ['media-router-os'], kind: 'workflow', autoTrigger: 'cinematic direction, world direction, shot continuity, or visual-story production', mayExecute: false },
  { id: 'plan', aliases: ['/plan', 'plan'], owningOs: 'founder-control-room', kind: 'control', autoTrigger: 'planning actions and explicit plan requests', mayExecute: false },
  { id: 'resume', aliases: ['/resume', 'resume'], owningOs: 'founder-control-room', kind: 'control', autoTrigger: 'resume or continue prior work', mayExecute: false },
  { id: 'cont', aliases: ['cont', 'continue'], owningOs: 'founder-control-room', kind: 'control', autoTrigger: 'continue the current bounded workstream', mayExecute: false },
  { id: 'approved', aliases: ['approved'], owningOs: 'founder-control-room', kind: 'control', autoTrigger: 'founder approval signal; never carries into a different authority gate', mayExecute: false },
  { id: 'next', aliases: ['next'], owningOs: 'founder-control-room', kind: 'control', autoTrigger: 'advance to the next already-authorized gate', mayExecute: false },
  { id: 'review', aliases: ['review'], owningOs: 'preflight-os', kind: 'control', autoTrigger: 'review actions and review requests', mayExecute: false },
  { id: 'merge', aliases: ['merge'], owningOs: 'preflight-os', kind: 'control', autoTrigger: 'merge intent; still requires exact-candidate authority and proof', mayExecute: false },
  { id: 'fix', aliases: ['fix'], owningOs: 'founder-control-room', kind: 'control', autoTrigger: 'repair intent', mayExecute: false },
  { id: 'prove', aliases: ['/prove', 'prove'], owningOs: 'preflight-os', kind: 'workflow', autoTrigger: 'verification, proof, exact-head, runtime, or outcome claims', mayExecute: false },
  { id: 'ship', aliases: ['/ship', 'ship'], owningOs: 'preflight-os', kind: 'workflow', autoTrigger: 'release, deploy, publish, or ship intent', mayExecute: false },
  { id: 'grow', aliases: ['/grow', 'grow'], owningOs: 'founder-control-room', kind: 'workflow', autoTrigger: 'growth, acquisition, retention, or distribution work', mayExecute: false },
  { id: 'handoff', aliases: ['/handoff', 'handoff'], owningOs: 'founder-control-room', kind: 'workflow', autoTrigger: 'handoff, delegation, or cross-agent continuation', mayExecute: false },
  { id: 'garyvee', aliases: ['/garyvee', 'garyvee'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'content distribution, audience, attention, and high-volume publishing strategy', mayExecute: false },
  { id: 'billgates', aliases: ['/billgates', 'billgates'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'systems, platform, standards, distribution, and compounding leverage', mayExecute: false },
  { id: 'elonmusk', aliases: ['/elonmusk', 'elonmusk'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'first-principles deletion, bottleneck, simplification, and speed pressure', mayExecute: false },
  { id: 'devil', aliases: ['/devil', 'devil'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'strongest adversarial case against the preferred plan', mayExecute: false },
  { id: 'steelman', aliases: ['/steelman', 'steelman'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'strongest fair case for a competing view or proposal', mayExecute: false },
  { id: 'human', aliases: ['/human', 'human'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'human consequences, founder agency, user reality, and practical friction', mayExecute: false },
  { id: 'ghost', aliases: ['/ghost', 'ghost'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'quiet background continuity and low-noise review context', mayExecute: false },
  { id: 'futureyou', aliases: ['/futureyou', 'futureyou'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'long-horizon continuity and compounding consequences', mayExecute: false },
  { id: 'steal', aliases: ['/steal', 'steal'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'legal reuse of principles, structures, patterns, and durable mechanisms', mayExecute: false },
  { id: 'hormozi', aliases: ['/hormozi', 'hormozi'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'offer clarity, value, friction, proof, and conversion', mayExecute: false },
  { id: 'firstprinciples', aliases: ['/firstprinciples', 'firstprinciples', 'first principles'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'assumption decomposition and irreducible-constraint rebuilding', mayExecute: false },
  { id: 'socrates', aliases: ['/socrates', 'socrates'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'premise interrogation and contradiction discovery', mayExecute: false },
  { id: 'antiadvice', aliases: ['/antiadvice', 'antiadvice'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'strong case against the default recommendation', mayExecute: false },
  { id: 'unlearn', aliases: ['/unlearn', 'unlearn'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'identify inherited assumptions no longer supported by evidence', mayExecute: false },
  { id: 'visualize', aliases: ['/visualize', 'visualize'], owningOs: 'design-os', kind: 'entrypoint', autoTrigger: 'UI, design, visual, image, layout, or editable artifact work', mayExecute: false },
  { id: 'artifact', aliases: ['/artifact', 'artifact'], owningOs: 'founder-control-room', kind: 'control', autoTrigger: 'create or transform a durable deliverable', mayExecute: false },
  { id: 'compact', aliases: ['/compact', 'compact'], owningOs: 'founder-control-room', kind: 'mode', autoTrigger: 'explicit request for compressed output', mayExecute: false },
  { id: 'btw', aliases: ['/btw', 'btw'], owningOs: 'founder-control-room', kind: 'control', autoTrigger: 'side-context that should update the active workstream without replacing it', mayExecute: false },
  { id: 'effort', aliases: ['/effort', 'effort'], owningOs: 'founder-control-room', kind: 'mode', autoTrigger: 'explicit effort-depth routing', mayExecute: false },
  { id: 'caveman', aliases: ['/caveman', 'caveman'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'reduce explanation to primitive causal language', mayExecute: false },
  { id: 'v10', aliases: ['/v10', 'v10'], owningOs: 'founder-control-room', kind: 'mode', autoTrigger: 'synthesize founder intent, truth, strategy, capability, authority, proof, and next gate', mayExecute: false },
  { id: 'insights', aliases: ['/insights', 'insights'], owningOs: 'council-os', kind: 'workflow', autoTrigger: 'extract decision-relevant patterns from evidence', mayExecute: false },
  { id: 'sales', aliases: ['/sales', 'sales'], owningOs: 'founder-control-room', kind: 'workflow', autoTrigger: 'sales, offer, pricing, revenue, or conversion work', mayExecute: false },
  { id: 'expert', aliases: ['/expert', 'expert'], owningOs: 'council-os', kind: 'mode', autoTrigger: 'explicit domain-expert framing', mayExecute: false },
  { id: 'teacher', aliases: ['/teacher', 'teacher'], owningOs: 'council-os', kind: 'mode', autoTrigger: 'teaching, learning, or explanatory work', mayExecute: false },
  { id: 'brief', aliases: ['/brief', 'brief'], owningOs: 'founder-control-room', kind: 'mode', autoTrigger: 'brief or summary output', mayExecute: false },
  { id: 'strategy', aliases: ['/strategy', 'strategy'], owningOs: 'council-os', kind: 'workflow', autoTrigger: 'strategy or planning work', mayExecute: false },
  { id: 'critic', aliases: ['/critic', 'critic'], owningOs: 'council-os', kind: 'lens', autoTrigger: 'critique and quality review', mayExecute: false },
  { id: 'brainstorm', aliases: ['/brainstorm', 'brainstorm'], owningOs: 'council-os', kind: 'workflow', autoTrigger: 'idea generation before selection', mayExecute: false },
  { id: 'promptengineer', aliases: ['/promptengineer', 'promptengineer', 'prompt engineer'], owningOs: 'promptos', kind: 'entrypoint', autoTrigger: 'prompt design, repair, evaluation, or routing', mayExecute: false },
  { id: 'skill-creator', aliases: ['/skill-creator', 'skill-creator', 'skill creator'], owningOs: 'promptos', kind: 'entrypoint', autoTrigger: 'new skill design or skill contract work', mayExecute: false },
] as const;

export type FcrStandingCommandAction =
  | 'inspect'
  | 'plan'
  | 'review'
  | 'draft'
  | 'write'
  | 'merge'
  | 'deploy'
  | 'migrate'
  | 'rollback'
  | 'publish'
  | 'send'
  | 'delete';

export interface FcrStandingCommandDecision {
  explicitCommandIds: string[];
  autoRoutedCommandIds: string[];
  standingCommandIds: string[];
  operatingSystemIds: FcrOperatingSystemId[];
  attackIntensity: number | null;
}

const COMMAND_BY_ID = new Map(FCR_STANDING_COMMAND_REGISTRY.map((command) => [command.id, command]));
const ALIAS_TO_COMMAND = new Map<string, string>();
for (const command of FCR_STANDING_COMMAND_REGISTRY) {
  ALIAS_TO_COMMAND.set(command.id, command.id);
  for (const alias of command.aliases) {
    ALIAS_TO_COMMAND.set(alias.toLocaleLowerCase('en-US').replace(/^\//, ''), command.id);
  }
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function normalizedGoal(goal: string): string {
  return goal.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function explicitCommandIdsFromGoal(goal: string): string[] {
  const ids: string[] = [];
  for (const match of goal.matchAll(/\/([a-z0-9-]+)/g)) {
    const commandId = ALIAS_TO_COMMAND.get(match[1]);
    if (commandId) pushUnique(ids, commandId);
  }

  for (const marker of ['ultrathink', 'truthmode', 'confess', 'redteam', 'lindymode', 'ooda', 'l99', 'goalfix', 'makevideo', 'leevize']) {
    if (new RegExp(`\\b${marker}\\b`).test(goal)) pushUnique(ids, marker);
  }
  if (/\battack\s+(?:\d+|ten)\b/.test(goal) || goal.includes('attack against itself ten times')) pushUnique(ids, 'attack');
  return ids;
}

function parsedAttackIntensity(goal: string): number | null {
  const numeric = goal.match(/\battack\s+(\d{1,6})\b/);
  if (numeric) return Number.parseInt(numeric[1], 10);
  if (/\battack\s+ten\b/.test(goal) || goal.includes('attack against itself ten times')) return 10;
  return null;
}

export function routeFcrStandingCommands(rawGoal: string, action: FcrStandingCommandAction): FcrStandingCommandDecision {
  const goal = normalizedGoal(rawGoal);
  const explicitCommandIds = explicitCommandIdsFromGoal(goal);
  const autoRoutedCommandIds: string[] = [...FCR_ALWAYS_ON_STANDING_COMMAND_IDS];

  if (action === 'plan') pushUnique(autoRoutedCommandIds, 'plan');
  if (action === 'review') pushUnique(autoRoutedCommandIds, 'review');
  if (action === 'merge') pushUnique(autoRoutedCommandIds, 'merge');
  if (['deploy', 'publish'].includes(action)) pushUnique(autoRoutedCommandIds, 'ship');
  if (['inspect', 'review'].includes(action) || /\b(audit|verify|proof|status|reality|truth|exact-head|runtime)\b/.test(goal)) {
    pushUnique(autoRoutedCommandIds, 'prove');
  }
  if (['write', 'merge', 'deploy', 'migrate', 'rollback'].includes(action)
    && /\b(fix|repair|bug|regression|broken|failure|failing|error|blocker)\b/.test(goal)) {
    pushUnique(autoRoutedCommandIds, 'goalfix');
  }
  if (/\b(video|movie|reel|cinematic|shot|storyboard|image-to-video|lip-sync)\b/.test(goal)) {
    pushUnique(autoRoutedCommandIds, 'makevideo');
    pushUnique(autoRoutedCommandIds, 'leevize');
  }
  if (/\b(attack|adversarial|stress[- ]?test)\b/.test(goal)) {
    pushUnique(autoRoutedCommandIds, 'attack');
    pushUnique(autoRoutedCommandIds, 'devil');
  }
  if (/\b(strategy|strategic)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'strategy');
  if (/\b(ui|design|visual|image|layout|screen|figma)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'visualize');
  if (/\b(content|social|audience|distribution|creator)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'garyvee');
  if (/\b(sales|offer|pricing|revenue|conversion|checkout|commercial)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'sales');
  if (/\b(prompt|prompting)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'promptengineer');
  if (/\b(skill|skills)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'skill-creator');
  if (/\b(teach|teacher|learn|explain)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'teacher');
  if (/\bexpert\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'expert');
  if (/\b(brief|summary|summarize)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'brief');
  if (/\b(compact|concise|shorten)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'compact');
  if (/\b(brainstorm|ideas?)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'brainstorm');
  if (/\b(critic|critique)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'critic');
  if (/\b(grow|growth|acquisition|retention)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'grow');
  if (/\b(handoff|delegate|delegation)\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'handoff');
  if (/\b(resume|continue|\bcont\b)\b/.test(goal)) {
    pushUnique(autoRoutedCommandIds, 'resume');
    pushUnique(autoRoutedCommandIds, 'cont');
  }
  if (/\bapproved\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'approved');
  if (/\bnext\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'next');
  if (/\bartifact\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'artifact');
  if (/\bbtw\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'btw');
  if (/\beffort\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'effort');
  if (/\bcaveman\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'caveman');
  if (/\bv10\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'v10');
  if (/\binsights?\b/.test(goal)) pushUnique(autoRoutedCommandIds, 'insights');

  const standingCommandIds: string[] = [];
  for (const id of [...autoRoutedCommandIds, ...explicitCommandIds]) pushUnique(standingCommandIds, id);

  const operatingSystemIds: FcrOperatingSystemId[] = ['founder-control-room', 'council-os', 'preflight-os'];
  for (const commandId of standingCommandIds) {
    const command = COMMAND_BY_ID.get(commandId);
    if (!command) continue;
    pushUnique(operatingSystemIds, command.owningOs);
    for (const dependentOsId of command.dependentOsIds ?? []) pushUnique(operatingSystemIds, dependentOsId);
  }

  return {
    explicitCommandIds,
    autoRoutedCommandIds,
    standingCommandIds,
    operatingSystemIds,
    attackIntensity: parsedAttackIntensity(goal),
  };
}
