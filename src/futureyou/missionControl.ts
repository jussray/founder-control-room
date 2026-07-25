export type MissionRisk = 'low' | 'medium' | 'high' | string;

export interface MissionControlProjectLabel {
  slug: string;
  name: string;
}

export interface MissionControlMissionInput {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  status: string;
  risk_level: MissionRisk;
  updated_at: string;
  project?: MissionControlProjectLabel | null;
}

export interface MissionControlEventInput {
  id: string;
  project_id: string;
  event_type: string;
  severity: string;
  screen?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  project?: MissionControlProjectLabel | null;
}

export type MissionControlDomain = 'sell' | 'ship' | 'grow' | 'verify' | 'risk';

export interface MissionControlAuthority {
  level: 'L1' | 'L2' | 'L3' | 'L4';
  mode: 'observe' | 'prepare' | 'decide' | 'verify';
  requiresExplicitApproval: boolean;
  boundary: string;
}

export interface MissionControlPriority {
  id: string;
  source: 'mission' | 'event';
  project: MissionControlProjectLabel | null;
  title: string;
  domain: MissionControlDomain;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  nextAction: string;
  evidence: string[];
  authority: MissionControlAuthority;
  observedAt: string;
}

export interface MissionControlBrief {
  version: 'futureyou-v8';
  generatedAt: string;
  northStar: string;
  operatingContract: {
    futureYou: string;
    redTeam: string;
    ooda: string;
    lindyMode: string;
    l99: string;
  };
  summary: {
    openMissions: number;
    waitingDecision: number;
    highRisk: number;
    recentCompletions: number;
    evidenceCoveragePercent: number;
  };
  priorities: MissionControlPriority[];
  blindSpots: string[];
}

const TERMINAL_STATUSES = new Set(['deployed', 'rejected', 'rolled_back']);

const STATUS_SCORE: Record<string, number> = {
  rolled_back: 88,
  in_review: 80,
  approved: 76,
  sandboxed: 66,
  proposed: 54,
  integrated: 46,
  deployed: 24,
  rejected: 8,
};

const DOMAIN_PATTERNS: Array<[MissionControlDomain, RegExp]> = [
  ['sell', /\b(client|customer|lead|deal|sales|sell|outreach|hubspot|payment|pricing|offer|revenue)\b/i],
  ['grow', /\b(content|linkedin|pinterest|youtube|seo|audience|campaign|growth|referral)\b/i],
  ['verify', /\b(proof|verify|verification|evidence|test|playwright|audit|read[- ]?back)\b/i],
  ['ship', /\b(ship|deploy|deployment|merge|pull request|\bpr\b|build|fix|release|github|supabase|cloudflare)\b/i],
];

function safeTime(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function ageDays(value: string, now: Date): number {
  const time = safeTime(value);
  if (!time) return 0;
  return Math.max(0, (now.getTime() - time) / 86_400_000);
}

function riskScore(risk: MissionRisk): number {
  if (risk === 'high') return 24;
  if (risk === 'medium') return 12;
  return 0;
}

function staleScore(days: number): number {
  if (days >= 14) return 24;
  if (days >= 7) return 16;
  if (days >= 3) return 8;
  return 0;
}

function classifyDomain(text: string, risk: MissionRisk): MissionControlDomain {
  if (risk === 'high') return 'risk';
  for (const [domain, pattern] of DOMAIN_PATTERNS) {
    if (pattern.test(text)) return domain;
  }
  return 'ship';
}

function missionAuthority(status: string): MissionControlAuthority {
  if (status === 'approved') {
    return {
      level: 'L4',
      mode: 'decide',
      requiresExplicitApproval: true,
      boundary: 'Execution remains separately approval-gated; this brief cannot perform the action.',
    };
  }
  if (status === 'in_review') {
    return {
      level: 'L3',
      mode: 'decide',
      requiresExplicitApproval: true,
      boundary: 'Review and founder decision only; no merge, send, publish, deploy, or spend action is implied.',
    };
  }
  if (status === 'integrated' || status === 'deployed') {
    return {
      level: 'L1',
      mode: 'verify',
      requiresExplicitApproval: false,
      boundary: 'Read-back and evidence collection only.',
    };
  }
  return {
    level: 'L2',
    mode: 'prepare',
    requiresExplicitApproval: false,
    boundary: 'Prepare analysis, drafts, checks, or sandbox work only.',
  };
}

function missionNextAction(status: string): string {
  switch (status) {
    case 'proposed':
      return 'Orient: confirm the outcome, owner, risk, and required checks before sandboxing.';
    case 'sandboxed':
      return 'Act in the sandbox, then attach exact-commit checks and reproducible evidence.';
    case 'in_review':
      return 'Decide: inspect the diff, unresolved risks, and proof gate before approving or requesting changes.';
    case 'approved':
      return 'Execute only the separately approved action, then read back provider state and attach evidence.';
    case 'integrated':
      return 'Verify the integrated commit and prepare deployment evidence without assuming runtime success.';
    case 'deployed':
      return 'Verify runtime behavior, user impact, and rollback readiness before calling the mission complete.';
    case 'rolled_back':
      return 'Observe the failure, preserve evidence, and open a corrective mission before retrying.';
    case 'rejected':
      return 'Keep closed unless new evidence materially changes the decision.';
    default:
      return 'Observe current state, identify the missing decision, and record one reversible next action.';
  }
}

function missionReason(mission: MissionControlMissionInput, days: number): string {
  const parts = [`${mission.status.replaceAll('_', ' ')} mission`];
  if (mission.risk_level === 'high') parts.push('high risk');
  if (days >= 3) parts.push(`unchanged for ${Math.floor(days)} days`);
  return parts.join(' · ');
}

function missionPriority(mission: MissionControlMissionInput, now: Date): MissionControlPriority {
  const days = ageDays(mission.updated_at, now);
  const text = `${mission.title} ${mission.description ?? ''}`;
  const domain = classifyDomain(text, mission.risk_level);
  const score = Math.min(100, (STATUS_SCORE[mission.status] ?? 40) + riskScore(mission.risk_level) + staleScore(days));
  const evidence = [
    `mission status: ${mission.status}`,
    `risk level: ${mission.risk_level}`,
    `last updated: ${mission.updated_at}`,
  ];
  if (mission.project) evidence.push(`project: ${mission.project.slug}`);

  return {
    id: `mission:${mission.id}`,
    source: 'mission',
    project: mission.project ?? null,
    title: mission.title,
    domain,
    score,
    confidence: mission.project && safeTime(mission.updated_at) ? 'high' : 'medium',
    reason: missionReason(mission, days),
    nextAction: missionNextAction(mission.status),
    evidence,
    authority: missionAuthority(mission.status),
    observedAt: mission.updated_at,
  };
}

function eventIsActionable(event: MissionControlEventInput, now: Date): boolean {
  if (ageDays(event.created_at, now) > 14) return false;
  if (event.severity === 'critical' || event.severity === 'error') return true;
  return /fail|drift|block|risk|rollback|payment|delivery/i.test(event.event_type);
}

function eventPriority(event: MissionControlEventInput): MissionControlPriority {
  const severityScore = event.severity === 'critical' ? 98 : event.severity === 'error' ? 88 : 68;
  const metadataKeys = Object.keys(event.metadata ?? {}).slice(0, 4);
  const evidence = [
    `event type: ${event.event_type}`,
    `severity: ${event.severity}`,
    `observed: ${event.created_at}`,
  ];
  if (event.screen) evidence.push(`screen: ${event.screen}`);
  if (metadataKeys.length > 0) evidence.push(`metadata keys: ${metadataKeys.join(', ')}`);

  return {
    id: `event:${event.id}`,
    source: 'event',
    project: event.project ?? null,
    title: event.event_type.replaceAll('_', ' '),
    domain: 'risk',
    score: severityScore,
    confidence: event.project && safeTime(event.created_at) ? 'high' : 'medium',
    reason: `${event.severity} operational signal requires read-back`,
    nextAction: 'Inspect the source event, attach it to an existing mission or open a corrective mission, and do not mark resolved without provider read-back.',
    evidence,
    authority: {
      level: 'L1',
      mode: 'observe',
      requiresExplicitApproval: false,
      boundary: 'Triage and evidence collection only; corrective execution requires its own mission and approval.',
    },
    observedAt: event.created_at,
  };
}

export function buildMissionControlBrief(input: {
  missions: MissionControlMissionInput[];
  activity: MissionControlEventInput[];
  now?: Date;
  limit?: number;
}): MissionControlBrief {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 7, 12));
  const openMissions = input.missions.filter((mission) => !TERMINAL_STATUSES.has(mission.status));
  const recentCompletions = input.missions.filter((mission) =>
    (mission.status === 'deployed' || mission.status === 'integrated') && ageDays(mission.updated_at, now) <= 1,
  ).length;

  const missionPriorities = input.missions
    .filter((mission) => mission.status !== 'rejected' || ageDays(mission.updated_at, now) <= 1)
    .map((mission) => missionPriority(mission, now));
  const eventPriorities = input.activity
    .filter((event) => eventIsActionable(event, now))
    .map(eventPriority);

  const priorities = [...missionPriorities, ...eventPriorities]
    .sort((a, b) => b.score - a.score || safeTime(b.observedAt) - safeTime(a.observedAt))
    .slice(0, limit);

  const blindSpots: string[] = [];
  if (input.missions.length === 0) blindSpots.push('No missions were returned, so there is no governed work queue to prioritize.');
  if (input.activity.every((event) => ageDays(event.created_at, now) > 1)) blindSpots.push('No sanitized operational event was observed in the last 24 hours.');
  if ([...input.missions, ...input.activity].some((item) => !item.project)) blindSpots.push('Some records are missing project labels, lowering prioritization confidence.');
  blindSpots.push('No verified revenue or expected-value feed is connected to this read model; rankings are operational, not financial forecasts.');

  const prioritiesWithEvidence = priorities.filter((priority) => priority.evidence.length >= 3).length;
  const evidenceCoveragePercent = priorities.length === 0 ? 0 : Math.round((prioritiesWithEvidence / priorities.length) * 100);

  return {
    version: 'futureyou-v8',
    generatedAt: now.toISOString(),
    northStar: 'Surface the highest-leverage verified next action without inventing certainty, revenue, or execution authority.',
    operatingContract: {
      futureYou: 'Still usable with dozens of products, repositories, providers, and active opportunities.',
      redTeam: 'Expose blind spots and never present a draft, estimate, or stale record as completed reality.',
      ooda: 'Observe signals, orient by risk and state, decide one next move, act through existing gates, then verify.',
      lindyMode: 'Organize around durable founder decisions rather than whichever provider happens to be connected today.',
      l99: 'L99 requires every recommendation to declare its authority level and keep approval boundaries explicit.',
    },
    summary: {
      openMissions: openMissions.length,
      waitingDecision: input.missions.filter((mission) => mission.status === 'in_review' || mission.status === 'approved').length,
      highRisk: input.missions.filter((mission) => mission.risk_level === 'high').length
        + input.activity.filter((event) => event.severity === 'critical').length,
      recentCompletions,
      evidenceCoveragePercent,
    },
    priorities,
    blindSpots,
  };
}
