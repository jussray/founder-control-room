import type { SupabaseClient } from '@supabase/supabase-js';
import { makeSupabaseClient, type SupabaseEnv } from '../lib/supabaseClient.js';
import {
  sendFounderControlRoomEmail,
  type ProjectEmailBinding,
} from '../worker/projectEmail.js';

export const MONDAY_PORTFOLIO_ORIENTATION_TIMEZONE = 'America/New_York';
export const MONDAY_PORTFOLIO_ORIENTATION_RECIPIENT = 'sekretbip@gmail.com';
const RETRY_AFTER_MS = 10 * 60_000;
const STALE_RUNNING_MS = 20 * 60_000;
const MAX_ITEMS = 5;

export interface MondayPortfolioOrientationEnv extends SupabaseEnv {
  FCR_EMAIL: ProjectEmailBinding;
}

interface LocalClock {
  weekday: string;
  localDate: string;
  hour: number;
  minute: number;
}

interface ProjectRow {
  id: string;
  slug: string;
  repo_identifier: string | null;
}

interface VerificationRunRow {
  project_id: string;
  repository_identifier: string;
  branch: string;
  commit_sha: string;
  overall_status: 'passed' | 'warning' | 'failed';
  signature_verified: boolean;
  scanned_at: string;
  received_at: string;
}

interface FindingRow {
  project_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  suggested_action: string | null;
  last_seen_at: string;
}

interface OrientationRunRow {
  week_key: string;
  status: 'running' | 'sent' | 'failed';
  attempt_count: number;
  started_at: string;
  completed_at: string | null;
  error_code: string | null;
}

export interface OrientationItem {
  project: string;
  state: 'BLOCKED' | 'ROUTINE' | 'VERIFIED' | 'UNKNOWN';
  reason: string;
  evidenceAt: string | null;
  nextAction: string;
}

export interface MondayPortfolioOrientation {
  weekKey: string;
  generatedAt: string;
  verified: OrientationItem[];
  proofCriticalBlockers: OrientationItem[];
  routine: OrientationItem[];
  unknown: OrientationItem[];
  decisionsAndDeadlines: string[];
  orderOfOperations: string[];
  sourceStatus: {
    githubRuntime: 'AVAILABLE';
    portfolioContinuity: 'PARTIAL';
    calendar: 'UNAVAILABLE_SCOPE_NOT_PROVEN';
    gmail: 'UNAVAILABLE_SCOPE_NOT_PROVEN';
    chief: 'PROPOSAL_ONLY_NO_WEEKLY_RANKING_RPC';
  };
}

export interface MondayPortfolioOrientationCycleResult {
  status: 'skipped' | 'blocked' | 'sent';
  reason?: string;
  weekKey?: string;
  messageId?: string;
  orientation?: MondayPortfolioOrientation;
}

function localClock(now: Date): LocalClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MONDAY_PORTFOLIO_ORIENTATION_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    weekday: value('weekday'),
    localDate: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
}

export function mondayPortfolioOrientationWeekKey(now = new Date()): string | null {
  const clock = localClock(now);
  if (clock.weekday !== 'Mon' || clock.hour < 8) return null;
  return clock.localDate;
}

function priorityWeight(item: OrientationItem, findingSeverity?: FindingRow['severity']): number {
  if (findingSeverity === 'critical') return 500;
  if (findingSeverity === 'high') return 400;
  if (item.state === 'BLOCKED') return 300;
  if (item.state === 'UNKNOWN') return 200;
  if (item.state === 'ROUTINE') return 100;
  return 0;
}

function latestByProject<T extends { project_id: string }>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!result.has(row.project_id)) result.set(row.project_id, row);
  }
  return result;
}

function newestFindingByProject(rows: FindingRow[]): Map<string, FindingRow> {
  const result = new Map<string, FindingRow>();
  const severityWeight: Record<FindingRow['severity'], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  for (const row of rows) {
    const existing = result.get(row.project_id);
    if (!existing || severityWeight[row.severity] > severityWeight[existing.severity]) {
      result.set(row.project_id, row);
    }
  }
  return result;
}

export function buildMondayPortfolioOrientation(input: {
  now: Date;
  weekKey: string;
  projects: ProjectRow[];
  verificationRuns: VerificationRunRow[];
  findings: FindingRow[];
}): MondayPortfolioOrientation {
  const latestRun = latestByProject(input.verificationRuns);
  const topFinding = newestFindingByProject(input.findings);
  const weighted: Array<{ item: OrientationItem; weight: number }> = [];

  for (const project of input.projects) {
    const run = latestRun.get(project.id);
    const finding = topFinding.get(project.id);
    let item: OrientationItem;

    if (finding && (finding.severity === 'critical' || finding.severity === 'high')) {
      item = {
        project: project.slug,
        state: 'BLOCKED',
        reason: `${finding.severity.toUpperCase()} finding: ${finding.title}`,
        evidenceAt: finding.last_seen_at,
        nextAction: finding.suggested_action || 'Inspect the current finding and prove or clear the blocker.',
      };
    } else if (run?.overall_status === 'failed') {
      item = {
        project: project.slug,
        state: 'BLOCKED',
        reason: `Latest repository verification failed at ${run.commit_sha.slice(0, 12)}.`,
        evidenceAt: run.received_at,
        nextAction: 'Open the exact failed verification receipt and repair the first load-bearing failure.',
      };
    } else if (!run) {
      item = {
        project: project.slug,
        state: 'UNKNOWN',
        reason: 'No current repository verification receipt is available.',
        evidenceAt: null,
        nextAction: 'Refresh repository verification before making a release or merge claim.',
      };
    } else if (run.overall_status === 'warning' || finding) {
      item = {
        project: project.slug,
        state: 'ROUTINE',
        reason: finding
          ? `${finding.severity.toUpperCase()} finding remains open: ${finding.title}`
          : `Latest repository verification is warning at ${run.commit_sha.slice(0, 12)}.`,
        evidenceAt: finding?.last_seen_at ?? run.received_at,
        nextAction: finding?.suggested_action || 'Review the warning after proof-critical blockers are handled.',
      };
    } else {
      item = {
        project: project.slug,
        state: 'VERIFIED',
        reason: `Latest repository verification passed at ${run.commit_sha.slice(0, 12)}${run.signature_verified ? ' with verified signature' : ''}.`,
        evidenceAt: run.received_at,
        nextAction: 'No founder intervention required unless a newer decision or deadline changes the state.',
      };
    }

    weighted.push({ item, weight: priorityWeight(item, finding?.severity) });
  }

  weighted.sort((left, right) => right.weight - left.weight || left.item.project.localeCompare(right.item.project));
  const items = weighted.map(({ item }) => item);
  const proofCriticalBlockers = items.filter((item) => item.state === 'BLOCKED');
  const unknown = items.filter((item) => item.state === 'UNKNOWN');
  const routine = items.filter((item) => item.state === 'ROUTINE');
  const verified = items.filter((item) => item.state === 'VERIFIED');
  const attention = [...proofCriticalBlockers, ...unknown, ...routine].slice(0, MAX_ITEMS);

  const orderOfOperations = attention.length
    ? attention.map((item, index) => `${index + 1}. ${item.project}: ${item.nextAction}`)
    : ['1. No proof-critical intervention is currently evidenced. Use founder time on the highest-value planned work.'];

  return {
    weekKey: input.weekKey,
    generatedAt: input.now.toISOString(),
    verified,
    proofCriticalBlockers,
    routine,
    unknown,
    decisionsAndDeadlines: [
      'Calendar deadlines are UNKNOWN in this runtime until the FCR Google connection proves Calendar scope.',
      'Gmail decisions/replies are UNKNOWN in this runtime until the FCR Google connection proves Gmail scope.',
      'Chief AI remains proposal-only here; no weekly founder-attention ranking RPC is claimed as live.',
    ],
    orderOfOperations,
    sourceStatus: {
      githubRuntime: 'AVAILABLE',
      portfolioContinuity: 'PARTIAL',
      calendar: 'UNAVAILABLE_SCOPE_NOT_PROVEN',
      gmail: 'UNAVAILABLE_SCOPE_NOT_PROVEN',
      chief: 'PROPOSAL_ONLY_NO_WEEKLY_RANKING_RPC',
    },
  };
}

function renderItems(title: string, items: OrientationItem[]): string[] {
  const lines = [`${title}:`];
  if (items.length === 0) return [...lines, '- None evidenced.'];
  return [
    ...lines,
    ...items.slice(0, MAX_ITEMS).map((item) =>
      `- ${item.project} [${item.state}] ${item.reason} Next: ${item.nextAction}`,
    ),
  ];
}

export function renderMondayPortfolioOrientation(orientation: MondayPortfolioOrientation): string {
  return [
    `Juss & Co Monday founder orientation — ${orientation.weekKey}`,
    '',
    ...renderItems('PROOF-CRITICAL BLOCKERS', orientation.proofCriticalBlockers),
    '',
    ...renderItems('VERIFIED / NO FOUNDER ACTION', orientation.verified),
    '',
    ...renderItems('ROUTINE', orientation.routine),
    '',
    ...renderItems('UNKNOWN', orientation.unknown),
    '',
    'DECISIONS / DEADLINES:',
    ...orientation.decisionsAndDeadlines.map((item) => `- ${item}`),
    '',
    'ORDER OF OPERATIONS:',
    ...orientation.orderOfOperations,
    '',
    'SOURCE STATUS:',
    `- GitHub/runtime proof: ${orientation.sourceStatus.githubRuntime}`,
    `- Portfolio continuity: ${orientation.sourceStatus.portfolioContinuity}`,
    `- Calendar: ${orientation.sourceStatus.calendar}`,
    `- Gmail: ${orientation.sourceStatus.gmail}`,
    `- Chief: ${orientation.sourceStatus.chief}`,
  ].join('\n');
}

async function loadEvidence(client: SupabaseClient): Promise<{
  projects: ProjectRow[];
  verificationRuns: VerificationRunRow[];
  findings: FindingRow[];
}> {
  const [projectsResult, runsResult, findingsResult] = await Promise.all([
    client
      .from('projects')
      .select('id,slug,repo_identifier')
      .eq('status', 'active')
      .order('slug', { ascending: true }),
    client
      .from('repository_verification_runs')
      .select('project_id,repository_identifier,branch,commit_sha,overall_status,signature_verified,scanned_at,received_at')
      .order('received_at', { ascending: false })
      .limit(500),
    client
      .from('repository_findings')
      .select('project_id,severity,title,suggested_action,last_seen_at')
      .eq('status', 'open')
      .order('last_seen_at', { ascending: false })
      .limit(500),
  ]);

  if (projectsResult.error) throw new Error(`orientation_projects_failed:${projectsResult.error.message}`);
  if (runsResult.error) throw new Error(`orientation_runs_failed:${runsResult.error.message}`);
  if (findingsResult.error) throw new Error(`orientation_findings_failed:${findingsResult.error.message}`);

  return {
    projects: (projectsResult.data ?? []) as ProjectRow[],
    verificationRuns: (runsResult.data ?? []) as VerificationRunRow[],
    findings: (findingsResult.data ?? []) as FindingRow[],
  };
}

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

async function claimWeek(client: SupabaseClient, weekKey: string, now: Date): Promise<'claimed' | 'duplicate' | 'blocked'> {
  const { data: existing, error: readError } = await client
    .from('portfolio_orientation_runs')
    .select('week_key,status,attempt_count,started_at,completed_at,error_code')
    .eq('week_key', weekKey)
    .maybeSingle();

  if (readError) {
    if (isMissingTable(readError)) return 'blocked';
    throw new Error(`orientation_claim_read_failed:${readError.message}`);
  }

  const current = existing as OrientationRunRow | null;
  if (!current) {
    const { error } = await client.from('portfolio_orientation_runs').insert({
      week_key: weekKey,
      scheduled_local_date: weekKey,
      timezone: MONDAY_PORTFOLIO_ORIENTATION_TIMEZONE,
      recipient: MONDAY_PORTFOLIO_ORIENTATION_RECIPIENT,
      status: 'running',
      attempt_count: 1,
      started_at: now.toISOString(),
    });
    if (!error) return 'claimed';
    if (error.code === '23505') return 'duplicate';
    if (isMissingTable(error)) return 'blocked';
    throw new Error(`orientation_claim_insert_failed:${error.message}`);
  }

  if (current.status === 'sent') return 'duplicate';
  const startedAt = Date.parse(current.started_at) || 0;
  const retryable = current.status === 'failed'
    ? now.getTime() - startedAt >= RETRY_AFTER_MS
    : current.status === 'running' && now.getTime() - startedAt >= STALE_RUNNING_MS;
  if (!retryable) return 'duplicate';

  const { error } = await client
    .from('portfolio_orientation_runs')
    .update({
      status: 'running',
      attempt_count: Math.max(1, current.attempt_count) + 1,
      started_at: now.toISOString(),
      completed_at: null,
      error_code: null,
    })
    .eq('week_key', weekKey);
  if (error) throw new Error(`orientation_claim_retry_failed:${error.message}`);
  return 'claimed';
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 180) || 'orientation_failed';
}

export async function runMondayPortfolioOrientationCycle(
  workerEnv: MondayPortfolioOrientationEnv,
  now = new Date(),
): Promise<MondayPortfolioOrientationCycleResult> {
  const weekKey = mondayPortfolioOrientationWeekKey(now);
  if (!weekKey) return { status: 'skipped', reason: 'outside_monday_0800_or_later_local_window' };

  const client = makeSupabaseClient(workerEnv);
  const claim = await claimWeek(client, weekKey, now);
  if (claim === 'duplicate') return { status: 'skipped', reason: 'week_already_claimed_or_sent', weekKey };
  if (claim === 'blocked') return { status: 'blocked', reason: 'portfolio_orientation_runs_schema_unavailable', weekKey };

  try {
    const evidence = await loadEvidence(client);
    const orientation = buildMondayPortfolioOrientation({ now, weekKey, ...evidence });
    const text = renderMondayPortfolioOrientation(orientation);
    const messageId = await sendFounderControlRoomEmail(workerEnv.FCR_EMAIL, {
      to: MONDAY_PORTFOLIO_ORIENTATION_RECIPIENT,
      subject: `Juss & Co Monday orientation — ${weekKey}`,
      text,
    });

    const { error } = await client
      .from('portfolio_orientation_runs')
      .update({
        status: 'sent',
        completed_at: new Date().toISOString(),
        message_id: messageId,
        source_status: orientation.sourceStatus,
        summary: orientation,
        error_code: null,
      })
      .eq('week_key', weekKey);
    if (error) throw new Error(`orientation_receipt_write_failed:${error.message}`);

    return { status: 'sent', weekKey, messageId, orientation };
  } catch (error) {
    await client
      .from('portfolio_orientation_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_code: safeErrorCode(error),
      })
      .eq('week_key', weekKey);
    throw error;
  }
}
