export const FCR_SKILL_ROUTER_CONTRACT = 'juss/fcr-skill-router@v1' as const;

export type FcrSkillRoutingIntent =
  | 'strategy'
  | 'repository-truth'
  | 'repair'
  | 'review-merge'
  | 'security'
  | 'ui-runtime'
  | 'incident'
  | 'publishing'
  | 'research'
  | 'provider-coordination';

export type FcrRuntimeSkillRequest =
  | 'codex-security:security-diff-scan'
  | 'codex-security:security-scan'
  | 'codex-security:fix-finding'
  | 'openai-developers:openai-api-troubleshooting'
  | 'product-design'
  | 'web-research';

export interface RouteFcrSkillsInput {
  goal: string;
  availableSkillIds: readonly string[];
  explicitSkillIds?: readonly string[];
}

export interface FcrSkillRoutingDecision {
  contract: typeof FCR_SKILL_ROUTER_CONTRACT;
  goal: string;
  intents: FcrSkillRoutingIntent[];
  selectedSkillIds: string[];
  unavailableSkillIds: string[];
  runtimeSkillRequests: FcrRuntimeSkillRequest[];
  requiredTools: string[];
  requiredProof: string[];
  mutationRequested: boolean;
  runtimeDiscoveryRequired: true;
  reasons: string[];
  nextGate: string;
}

const REPO_TRUTH = 'skill:repo-truth';
const GOALFIX = 'skill:goalfix';
const REVIEW_VERIFY_MERGE = 'skill:review-verify-merge';
const PROOF_LED_PUBLISHING = 'skill:proof-led-publishing';
const CHIEF_AI = 'skill:juss-chief-ai';
const AGENT_ROUTER = 'skill:control-room-agent-router';
const PROOF_LADDER = 'skill:control-room-proof-ladder';
const INCIDENT_TRIAGE = 'skill:control-room-incident-triage';
const DESIGN_IMPLEMENTATION = 'skill:control-room-design-implementation';

const EXPLICIT_SKILL_ALIASES: Readonly<Record<string, string>> = {
  goalfix: GOALFIX,
  'repo-truth': REPO_TRUTH,
  'review-verify-merge': REVIEW_VERIFY_MERGE,
  'proof-led-publishing': PROOF_LED_PUBLISHING,
  'juss-chief-ai': CHIEF_AI,
  'control-room-agent-router': AGENT_ROUTER,
  'control-room-proof-ladder': PROOF_LADDER,
  'control-room-incident-triage': INCIDENT_TRIAGE,
  'control-room-design-implementation': DESIGN_IMPLEMENTATION,
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function matches(goal: string, expression: RegExp): boolean {
  expression.lastIndex = 0;
  return expression.test(goal);
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function explicitSkillsFromGoal(goal: string): string[] {
  const selected: string[] = [];
  for (const match of goal.matchAll(/\/([a-z0-9-]+)/g)) {
    const skill = EXPLICIT_SKILL_ALIASES[match[1]];
    if (skill) pushUnique(selected, skill);
  }
  return selected;
}

function isMutationRequested(goal: string): boolean {
  return matches(
    goal,
    /\b(fix|repair|implement|build|merge|deploy|publish|send|update|create|delete|close|write|patch|ship|launch)\b/,
  );
}

export function routeFcrSkills(input: RouteFcrSkillsInput): FcrSkillRoutingDecision {
  const goal = normalize(input.goal);
  const available = new Set(input.availableSkillIds);
  const candidateSkills: string[] = [];
  const runtimeSkillRequests: FcrRuntimeSkillRequest[] = [];
  const requiredTools: string[] = [];
  const requiredProof: string[] = [];
  const intents: FcrSkillRoutingIntent[] = [];
  const reasons: string[] = [];
  const mutationRequested = isMutationRequested(goal);

  for (const skill of input.explicitSkillIds ?? []) pushUnique(candidateSkills, skill);
  for (const skill of explicitSkillsFromGoal(goal)) pushUnique(candidateSkills, skill);

  const repositoryTask = matches(
    goal,
    /\b(repo|repository|github|branch|commit|pull request|pr|main|code|test|tests|ci|actions|workflow|merge)\b/,
  );
  const repairTask = matches(goal, /\b(fix|repair|broken|failing|failure|bug|patch|implement|build|regression)\b/);
  const reviewMergeTask = matches(goal, /\b(review|verify|merge|pull request|pr|exact-head|exact head)\b/);
  const auditTask = matches(goal, /\b(audit|inspect|evidence|proof|truth|verify|status|receipt)\b/);
  const securityTask = matches(
    goal,
    /\b(security|vulnerability|vulnerabilities|threat|attack|secret|auth|permission|rls|injection|xss|csrf)\b/,
  );
  const uiTask = matches(
    goal,
    /\b(ui|screen|design|figma|layout|responsive|mobile|browser|playwright|frontend|visual)\b/,
  );
  const incidentTask = matches(goal, /\b(outage|incident|down|timeout|500|502|503|522|production failure)\b/);
  const publishingTask = matches(
    goal,
    /\b(post|publish|linkedin|instagram|threads|campaign|content|social|caption)\b/,
  );
  const researchTask = matches(goal, /\b(research|latest|current docs|source verification|fact-check|fact check)\b/);
  const providerTask = matches(
    goal,
    /\b(cloudflare|supabase|hubspot|figma|github|slack|asana|shopify|vercel|stripe|plugin|connector|provider)\b/,
  );
  const strategyTask = matches(goal, /\b(strategy|architecture|plan|coordinate|router|routing|skill router)\b/);

  if (strategyTask) {
    pushUnique(intents, 'strategy');
    pushUnique(candidateSkills, CHIEF_AI);
    reasons.push('Strategy or coordination language selects Chief AI for bounded synthesis.');
  }

  if (repositoryTask || auditTask) {
    pushUnique(intents, 'repository-truth');
    pushUnique(candidateSkills, REPO_TRUTH);
    pushUnique(requiredTools, 'github');
    pushUnique(requiredProof, 'authoritative repository, branch, and exact commit SHA');
    reasons.push('Repository or audit language requires repository truth before conversational memory.');
  }

  if (repairTask) {
    pushUnique(intents, 'repair');
    pushUnique(candidateSkills, GOALFIX);
    pushUnique(requiredProof, 'focused cause, reversible patch, and narrow verification');
    reasons.push('Repair language selects goalfix for the smallest reversible fix.');
  }

  if (reviewMergeTask) {
    pushUnique(intents, 'review-merge');
    pushUnique(candidateSkills, REVIEW_VERIFY_MERGE);
    pushUnique(requiredProof, 'exact-head checks and unresolved review-thread state');
    reasons.push('Review or merge language selects review-verify-merge.');
  }

  if (auditTask) {
    pushUnique(candidateSkills, PROOF_LADDER);
    pushUnique(requiredProof, 'state → evidence → claim trace');
  }

  if (securityTask) {
    pushUnique(intents, 'security');
    const diffScoped = matches(goal, /\b(pr|pull request|diff|commit|patch|changed files|branch)\b/);
    const fixingFinding = matches(goal, /\b(fix|repair|patch|remediate)\b.*\b(finding|vulnerability|security)\b|\b(finding|vulnerability)\b.*\b(fix|repair|patch|remediate)\b/);
    pushUnique(runtimeSkillRequests, diffScoped
      ? 'codex-security:security-diff-scan'
      : 'codex-security:security-scan');
    if (fixingFinding) pushUnique(runtimeSkillRequests, 'codex-security:fix-finding');
    pushUnique(requiredProof, 'security finding validation bound to the inspected source');
    reasons.push('Security routing requests a Codex Security specialist at runtime; repository policy does not claim installation state.');
  }

  if (uiTask) {
    pushUnique(intents, 'ui-runtime');
    pushUnique(candidateSkills, DESIGN_IMPLEMENTATION);
    pushUnique(runtimeSkillRequests, 'product-design');
    pushUnique(requiredTools, 'playwright');
    pushUnique(requiredProof, 'exact-head Playwright evidence for UI/runtime claims');
    reasons.push('UI or design language requires design implementation guidance plus Playwright proof.');
  }

  if (incidentTask) {
    pushUnique(intents, 'incident');
    pushUnique(candidateSkills, INCIDENT_TRIAGE);
    pushUnique(requiredProof, 'failure classification and provider/runtime receipt');
  }

  if (publishingTask) {
    pushUnique(intents, 'publishing');
    pushUnique(candidateSkills, PROOF_LED_PUBLISHING);
    pushUnique(requiredProof, 'public claim backed by current proof');
  }

  if (researchTask) {
    pushUnique(intents, 'research');
    pushUnique(runtimeSkillRequests, 'web-research');
    pushUnique(requiredProof, 'fresh source receipts');
  }

  if (providerTask) {
    pushUnique(intents, 'provider-coordination');
    pushUnique(candidateSkills, AGENT_ROUTER);
    reasons.push('Provider or connector language selects the agent router to keep one execution owner and one authority boundary.');
  }

  if (matches(goal, /\b(openai|api|agent sdk|agents sdk)\b/) && matches(goal, /\b(error|fail|failure|broken|debug|troubleshoot)\b/)) {
    pushUnique(runtimeSkillRequests, 'openai-developers:openai-api-troubleshooting');
  }

  if (candidateSkills.length === 0) {
    pushUnique(candidateSkills, CHIEF_AI);
    pushUnique(intents, 'strategy');
    reasons.push('No specialist rule matched, so Chief AI is the narrow fallback rather than fan-out to every skill.');
  }

  const selectedSkillIds = candidateSkills.filter(skill => available.has(skill));
  const unavailableSkillIds = candidateSkills.filter(skill => !available.has(skill));

  const nextGate = unavailableSkillIds.length > 0 || runtimeSkillRequests.length > 0
    ? 'Discover runtime skill availability, then invoke only the selected available specialists in order.'
    : mutationRequested
      ? 'Use the selected skills to inspect first; mutate only after repository authority and required proof gates are satisfied.'
      : 'Invoke the selected skills read-first and return evidence-bound guidance.';

  return {
    contract: FCR_SKILL_ROUTER_CONTRACT,
    goal: input.goal.trim(),
    intents,
    selectedSkillIds,
    unavailableSkillIds,
    runtimeSkillRequests,
    requiredTools,
    requiredProof,
    mutationRequested,
    runtimeDiscoveryRequired: true,
    reasons,
    nextGate,
  };
}
