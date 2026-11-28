import type { SupabaseClient } from '@supabase/supabase-js';
import { makeSupabaseClient, type SupabaseEnv } from '../lib/supabaseClient.js';
import { providerForProject } from '../providers/providerFactory.js';
import {
  sendFounderControlRoomEmail,
  type ProjectEmailBinding,
} from '../worker/projectEmail.js';

export const MONDAY_PORTFOLIO_ORIENTATION_TIMEZONE = 'America/New_York';
export const MONDAY_PORTFOLIO_ORIENTATION_RECIPIENT = 'sekretbip@gmail.com';
const RETRY_AFTER_MS = 10 * 60_000;
const EVIDENCE_FRESHNESS_MS = 7 * 24 * 60 * 60_000;
const MAX_ITEMS = 5;

export interface MondayPortfolioOrientationEnv extends SupabaseEnv {
  FCR_EMAIL: ProjectEmailBinding;
}

interface LocalClock {
  weekday: string;
  localDate: string;
  hour: number;
}

interface ProjectRow {
  id: string;
  slug: string;
  repo_identifier: string | null;
  repo_provider?: string | null;
}

interface CurrentHeadObservation {
  repositoryIdentifier: string;
  branch: string;
  commitSha: string;
}

interface VerificationRunRow {
  project_id: string;
  repository_identifier: string;
  repository_provider?: string;
  runner?: Record<string, unknown> | null;
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
  state: 'BLOCKED' | 'STALE' | 'ROUTINE' | 'VERIFIED' | 'UNKNOWN';
  reason: string;
  evidenceAt: string | null;
  nextAction: string;
}

export interface MondayPortfolioOrientation {
  weekKey: string;
  generatedAt: string;
  verified: OrientationItem[];
  proofCriticalBlockers: OrientationItem[];
  stale: OrientationItem[];
  routine: OrientationItem[];
  unknown: OrientationItem[];
  decisionsAndDeadlines: string[];
  orderOfOperations: string[];
  sourceStatus: {
    githubRuntime: 'HEAD_OBSERVED' | 'PARTIAL' | 'RECEIPTS_ONLY';
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
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    weekday: value('weekday'),
    localDate: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
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
  if (item.state === 'STALE') return 250;
  if (item.state === 'UNKNOWN') return 200;
  if (item.state === 'ROUTINE') return 100;
  return 0;
}

function observationAtMillis(run: VerificationRunRow): number {
  const parsed = Date.parse(run.scanned_at);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function receivedAtMillis(run: VerificationRunRow): number {
  const parsed = Date.parse(run.received_at);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function latestVerificationByProject(rows: VerificationRunRow[]): Map<string, VerificationRunRow> {
  const result = new Map<string, VerificationRunRow>();
  for (const row of rows) {
    const existing = result.get(row.project_id);
    const observedAt = observationAtMillis(row);
    const existingObservedAt = existing ? observationAtMillis(existing) : Number.NEGATIVE_INFINITY;
    if (
      !existing
      || observedAt > existingObservedAt
      || (observedAt === existingObservedAt && receivedAtMillis(row) > receivedAtMillis(existing))
    ) {
      result.set(row.project_id, row);
    }
  }
  return result;
}

function highestSeverityFindingByProject(rows: FindingRow[]): Map<string, FindingRow> {
  const result = new Map<string, FindingRow>();
  const severityWeight: Record<FindingRow['severity'], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  for (const row of rows) {
    const existing = result.get(row.project_id);
    if (
      !existing
      || severityWeight[row.severity] > severityWeight[existing.severity]
      || (
        severityWeight[row.severity] === severityWeight[existing.severity]
        && Date.parse(row.last_seen_at) > Date.parse(existing.last_seen_at)
      )
    ) {
      result.set(row.project_id, row);
    }
  }
  return result;
}

function verificationFreshness(
  run: VerificationRunRow,
  now: Date,
): 'fresh' | 'stale' | 'future' | 'invalid' {
  const observedAt = observationAtMillis(run);
  if (!Number.isFinite(observedAt)) return 'invalid';
  const age = now.getTime() - observedAt;
  if (age < 0) return 'future';
  return age <= EVIDENCE_FRESHNESS_MS ? 'fresh' : 'stale';
}

function sameRepository(project: ProjectRow, identifier: string): boolean {
  if (!project.repo_identifier) return false;
  return project.repo_provider === 'github'
    ? project.repo_identifier.toLowerCase() === identifier.toLowerCase()
    : project.repo_identifier === identifier;
}

function isPreviewReceipt(run: VerificationRunRow): boolean {
  return typeof run.runner?.mode === 'string' && run.runner.mode.startsWith('preview_branch_');
}

export function buildMondayPortfolioOrientation(input: {
  now: Date;
  weekKey: string;
  projects: ProjectRow[];
  verificationRuns: VerificationRunRow[];
  findings: FindingRow[];
  currentHeads?: ReadonlyMap<string, CurrentHeadObservation>;
}): MondayPortfolioOrientation {
  const latestRun = latestVerificationByProject(input.verificationRuns);
  const topFinding = highestSeverityFindingByProject(input.findings);
  const weighted: Array<{ item: OrientationItem; weight: number }> = [];

  for (const project of input.projects) {
    const run = latestRun.get(project.id);
    const finding = topFinding.get(project.id);
    const freshness = run ? verificationFreshness(run, input.now) : null;
    const currentHead = input.currentHeads?.get(project.id);
    let item: OrientationItem;

    if (finding && (finding.severity === 'critical' || finding.severity === 'high')) {
      item = {
        project: project.slug,
        state: 'BLOCKED',
        reason: `${finding.severity.toUpperCase()} finding: ${finding.title}`,
        evidenceAt: finding.last_seen_at,
        nextAction: finding.suggested_action || 'Inspect the current finding and prove or clear the blocker.',
      };
    } else if (!run) {
      item = {
        project: project.slug,
        state: 'UNKNOWN',
        reason: 'No repository verification receipt is available.',
        evidenceAt: null,
        nextAction: 'Refresh repository verification before making a release or merge claim.',
      };
    } else if (!sameRepository(project, run.repository_identifier)
        || (project.repo_provider && run.repository_provider !== project.repo_provider)
        || isPreviewReceipt(run)) {
      item = {
        project: project.slug, state: 'UNKNOWN',
        reason: 'Receipt repository identity is mismatched or the evidence is preview-only.',
        evidenceAt: run.scanned_at,
        nextAction: 'Obtain a signed default-branch verification receipt for the registered repository.',
      };
    } else if (freshness === 'invalid' || freshness === 'future') {
      item = {
        project: project.slug,
        state: 'UNKNOWN',
        reason: freshness === 'future'
          ? `Latest repository verification claims a future observation time at ${run.commit_sha.slice(0, 12)}.`
          : `Latest repository verification has an invalid observation time at ${run.commit_sha.slice(0, 12)}.`,
        evidenceAt: freshness === 'future' ? run.scanned_at : null,
        nextAction: 'Refresh exact-head repository verification with a valid observation timestamp.',
      };
    } else if (freshness === 'stale') {
      item = {
        project: project.slug,
        state: 'STALE',
        reason: `Latest repository verification observation is older than 7 days at ${run.commit_sha.slice(0, 12)}.`,
        evidenceAt: run.scanned_at,
        nextAction: 'Refresh exact-head repository verification before treating prior evidence as current.',
      };
    } else if (run.overall_status === 'failed') {
      item = {
        project: project.slug,
        state: 'BLOCKED',
        reason: `Latest repository verification failed at ${run.commit_sha.slice(0, 12)}.`,
        evidenceAt: run.scanned_at,
        nextAction: 'Open the exact failed verification receipt and repair the first load-bearing failure.',
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
    } else if (!run.signature_verified || !/^[0-9a-f]{40}$/i.test(run.commit_sha)) {
      item = {
        project: project.slug, state: 'UNKNOWN',
        reason: 'Passing receipt lacks a verified signature or an exact commit SHA.',
        evidenceAt: run.scanned_at,
        nextAction: 'Refresh signed exact-head verification.',
      };
    } else if (!currentHead || !sameRepository(project, currentHead.repositoryIdentifier)
        || !/^[0-9a-f]{40}$/i.test(currentHead.commitSha) || !currentHead.branch) {
      item = {
        project: project.slug, state: 'UNKNOWN',
        reason: 'Signed receipt passed, but the current default-branch head was not independently observed.',
        evidenceAt: run.scanned_at,
        nextAction: 'Observe the registered repository default-branch head before making a current-state claim.',
      };
    } else if (run.branch !== currentHead.branch || run.commit_sha !== currentHead.commitSha) {
      item = {
        project: project.slug, state: 'STALE',
        reason: 'Passing receipt does not match the observed default-branch head.',
        evidenceAt: run.scanned_at,
        nextAction: 'Refresh verification for the observed default-branch head.',
      };
    } else {
      item = {
        project: project.slug,
        state: 'VERIFIED',
        reason: `Signed repository verification passed at observed default-branch head ${run.commit_sha.slice(0, 12)}.`,
        evidenceAt: run.scanned_at,
        nextAction: 'No immediate intervention; re-observe the head before any release or merge decision.',
      };
    }

    weighted.push({ item, weight: priorityWeight(item, finding?.severity) });
  }

  weighted.sort((left, right) => right.weight - left.weight || left.item.project.localeCompare(right.item.project));
  const items = weighted.map(({ item }) => item);
  const proofCriticalBlockers = items.filter((item) => item.state === 'BLOCKED');
  const stale = items.filter((item) => item.state === 'STALE');
  const unknown = items.filter((item) => item.state === 'UNKNOWN');
  const routine = items.filter((item) => item.state === 'ROUTINE');
  const verified = items.filter((item) => item.state === 'VERIFIED');
  const attention = [...proofCriticalBlockers, ...stale, ...unknown, ...routine].slice(0, MAX_ITEMS);

  const orderOfOperations = attention.length
    ? attention.map((item, index) => `${index + 1}. ${item.project}: ${item.nextAction}`)
    : ['1. No proof-critical intervention is currently evidenced. Use founder time on the highest-value planned work.'];

  return {
    weekKey: input.weekKey,
    generatedAt: input.now.toISOString(),
    verified,
    proofCriticalBlockers,
    stale,
    routine,
    unknown,
    decisionsAndDeadlines: [
      'Calendar deadlines are UNKNOWN in this runtime until the FCR Google connection proves Calendar scope.',
      'Gmail decisions/replies are UNKNOWN in this runtime until the FCR Google connection proves Gmail scope.',
      'Chief AI remains proposal-only here; no weekly founder-attention ranking RPC is claimed as live.',
    ],
    orderOfOperations,
    sourceStatus: {
      githubRuntime: input.currentHeads?.size
        ? (input.currentHeads.size === input.projects.length ? 'HEAD_OBSERVED' : 'PARTIAL')
        : 'RECEIPTS_ONLY',
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
    ...renderItems('STALE / REFRESH REQUIRED', orientation.stale),
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
    `- Repository default-head observations: ${orientation.sourceStatus.githubRuntime}`,
    `- Portfolio continuity: ${orientation.sourceStatus.portfolioContinuity}`,
    `- Calendar: ${orientation.sourceStatus.calendar}`,
    `- Gmail: ${orientation.sourceStatus.gmail}`,
    `- Chief: ${orientation.sourceStatus.chief}`,
  ].join('\n');
}

async function observeCurrentHead(project: ProjectRow): Promise<CurrentHeadObservation | null> {
  if (!project.repo_identifier || !project.repo_provider) return null;
  try {
    const provider = providerForProject({
      repo_provider: project.repo_provider, slug: project.slug, repo_identifier: project.repo_identifier,
    });
    const live = await provider.getProject(project.slug);
    if (!sameRepository(project, live.locator) || live.provider !== project.repo_provider
        || !live.defaultBranch || !live.isActive) return null;
    const ref = await provider.getRef(project.slug, live.defaultBranch);
    if (ref.name !== live.defaultBranch || !/^[0-9a-f]{40}$/i.test(ref.commitSha)) return null;
    return { repositoryIdentifier: live.locator, branch: live.defaultBranch, commitSha: ref.commitSha };
  } catch {
    // A missing credential, unavailable provider, or failed read cannot become proof.
    return null;
  }
}

/** Read the newest run and highest-priority open finding for every active project.
 * No portfolio-wide row cap may hide a quieter project's evidence.
 */
export async function loadMondayPortfolioEvidence(client: SupabaseClient, now: Date): Promise<{
  projects: ProjectRow[];
  verificationRuns: VerificationRunRow[];
  findings: FindingRow[];
  currentHeads: Map<string, CurrentHeadObservation>;
}> {
  const projects: ProjectRow[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const page = await client.from('projects')
      .select('id,slug,repo_identifier,repo_provider')
      .eq('status', 'active').order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (page.error) throw new Error('orientation_projects_failed');
    const rows = (page.data ?? []) as ProjectRow[];
    projects.push(...rows);
    if (rows.length < pageSize) break;
  }

  const verificationRuns: VerificationRunRow[] = [];
  const findings: FindingRow[] = [];
  const currentHeads = new Map<string, CurrentHeadObservation>();
  const findingColumns = 'project_id,severity,title,suggested_action,last_seen_at';
  // Bounded concurrency protects the DB and repository providers.
  for (let offset = 0; offset < projects.length; offset += 4) {
    await Promise.all(projects.slice(offset, offset + 4).map(async project => {
      const [runsResult, blockingResult] = await Promise.all([
        client.from('repository_verification_runs')
          .select('project_id,repository_identifier,repository_provider,runner,branch,commit_sha,overall_status,signature_verified,scanned_at,received_at')
          .eq('project_id', project.id)
          .order('scanned_at', { ascending: false })
          .order('received_at', { ascending: false }).order('id', { ascending: false }).limit(1),
        client.from('repository_findings').select(findingColumns)
          .eq('project_id', project.id).eq('status', 'open').in('severity', ['critical', 'high'])
          .order('severity', { ascending: true })
          .order('last_seen_at', { ascending: false }).order('id', { ascending: false }).limit(1),
      ]);
      if (runsResult.error) throw new Error('orientation_runs_failed');
      if (blockingResult.error) throw new Error('orientation_findings_failed');
      const run = (runsResult.data ?? [])[0] as VerificationRunRow | undefined;
      if (run) verificationRuns.push(run);

      let finding = (blockingResult.data ?? [])[0] as FindingRow | undefined;
      if (!finding) {
        const routine = await client.from('repository_findings').select(findingColumns)
          .eq('project_id', project.id).eq('status', 'open').in('severity', ['medium', 'low'])
          .order('severity', { ascending: false })
          .order('last_seen_at', { ascending: false }).order('id', { ascending: false }).limit(1);
        if (routine.error) throw new Error('orientation_findings_failed');
        finding = (routine.data ?? [])[0] as FindingRow | undefined;
      }
      if (finding) findings.push(finding);

      if (run?.overall_status === 'passed' && run.signature_verified && !isPreviewReceipt(run)
          && sameRepository(project, run.repository_identifier) && verificationFreshness(run, now) === 'fresh'
          && !finding) {
        const head = await observeCurrentHead(project);
        if (head) currentHeads.set(project.id, head);
      }
    }));
  }
  return { projects, verificationRuns, findings, currentHeads };
}

function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/** Only a failure conclusively recorded before any provider send attempt is retryable. */
export function canRetryMondayPortfolioOrientation(
  current: Pick<OrientationRunRow, 'status' | 'started_at' | 'error_code'>,
  now: Date,
): boolean {
  if (current.status !== 'failed' || !current.error_code?.startsWith('orientation_pre_send_failed:')) return false;
  const startedAt = Date.parse(current.started_at);
  return Number.isFinite(startedAt) && now.getTime() - startedAt >= RETRY_AFTER_MS;
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

  // A stale running row might represent a delivered email whose receipt was lost.
  // Never automatically reclaim it, and retry only explicitly pre-send failures.
  if (!canRetryMondayPortfolioOrientation(current, now)) return 'duplicate';

  const { data: claimed, error } = await client
    .from('portfolio_orientation_runs')
    .update({
      status: 'running',
      attempt_count: Math.max(1, current.attempt_count) + 1,
      started_at: now.toISOString(),
      completed_at: null,
      error_code: null,
    })
    .eq('week_key', weekKey)
    .eq('status', current.status)
    .eq('started_at', current.started_at)
    .select('week_key')
    .maybeSingle();
  if (error) throw new Error(`orientation_claim_retry_failed:${error.message}`);
  return claimed ? 'claimed' : 'duplicate';
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

  let sendAttempted = false;
  let acceptedMessageId: string | null = null;
  try {
    const evidence = await loadMondayPortfolioEvidence(client, now);
    const orientation = buildMondayPortfolioOrientation({ now, weekKey, ...evidence });
    const text = renderMondayPortfolioOrientation(orientation);

    // Once sending begins, provider acceptance may be unknowable after a timeout.
    // Fail closed on subsequent cron ticks rather than risk a duplicate send.
    sendAttempted = true;
    acceptedMessageId = await sendFounderControlRoomEmail(workerEnv.FCR_EMAIL, {
      to: MONDAY_PORTFOLIO_ORIENTATION_RECIPIENT,
      subject: `Juss & Co Monday orientation — ${weekKey}`,
      text,
    });

    const { data: completed, error } = await client
      .from('portfolio_orientation_runs')
      .update({
        status: 'sent',
        completed_at: new Date().toISOString(),
        message_id: acceptedMessageId,
        source_status: orientation.sourceStatus,
        summary: orientation,
        error_code: null,
      })
      .eq('week_key', weekKey)
      .eq('status', 'running')
      .eq('started_at', now.toISOString())
      .select('week_key')
      .maybeSingle();
    if (error || !completed) throw new Error(`orientation_receipt_write_failed:${error?.message ?? 'row_not_updated'}`);

    return { status: 'sent', weekKey, messageId: acceptedMessageId, orientation };
  } catch (error) {
    const errorCode = sendAttempted
      ? 'orientation_send_outcome_unknown_manual_reconcile'
      : `orientation_pre_send_failed:${safeErrorCode(error)}`;
    try {
      const { error: receiptError } = await client
        .from('portfolio_orientation_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_code: errorCode,
          ...(acceptedMessageId ? { message_id: acceptedMessageId } : {}),
        })
        .eq('week_key', weekKey)
        .eq('status', 'running')
        .eq('started_at', now.toISOString());
      if (receiptError) console.warn('orientation_failure_receipt_unavailable');
    } catch {
      // Keep the original failure visible. A surviving 'running' row also blocks retry.
      console.warn('orientation_failure_receipt_unavailable');
    }
    throw error;
  }
}
