import { createHash } from 'node:crypto';
import { classifyAiInboxMessage } from './aiInboxRouting.js';
import { reconcileGithubInboxMessage, type GithubInboxProject } from './githubInboxReconciliation.js';
import type { AiInboxMessage } from './aiInboxRouting.js';
import type { RawProviderEvent } from '../events/inbox.js';

export type GithubInboxWatchEvent = RawProviderEvent;
type ReaderFactory = Parameters<typeof reconcileGithubInboxMessage>[2];
interface Scope {
  accountId: string;
  projectSlug: string;
  labelId: string;
}
interface WatchDeps {
  status(): { configured: boolean; expectedAccount: string | null; projectSlug: string | null; labelId: string | null };
  project(slug: string): Promise<GithubInboxProject | null>;
  probe(): Promise<Scope>;
  read(options: { maxResults: number; pageToken?: string }): Promise<{
    accountId: string; projectSlug: string; messages: AiInboxMessage[]; nextPageToken: string | null;
  }>;
  reader: ReaderFactory;
  persist(event: GithubInboxWatchEvent): Promise<{ id: string; isDuplicate: boolean }>;
}

const PAGE_SIZE = 5;
const MAX_PAGES = 3;
const REPO = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function normalizedCounts(value: Record<string, number> | undefined): Record<string, number> | undefined {
  return value && Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

/** Hourly, opt-in metadata scan. The event inbox is the durable deduplication boundary.
 * No raw mail, sender address, message ID, cursor, or provider exception is retained.
 * Every receipt remains unresolved; intake and snapshots are not repair authority.
 */
export async function runGithubInboxWatch(enabled: boolean, now: Date, deps: WatchDeps) {
  let inserted = 0;
  let duplicates = 0;
  let outOfScope = 0;
  let pages = 0;
  let coverage: 'unknown' | 'bounded_inbox' | 'truncated' = 'unknown';
  const summary = (status: 'skipped' | 'blocked' | 'observed' | 'failed', reason: string) =>
    ({ status, reason, inserted, duplicates, outOfScope, pages, coverage });

  if (!enabled || now.getUTCMinutes() !== 0) return summary('skipped', 'disabled_or_not_due');
  try {
    const config = deps.status();
    if (!config.configured || !config.expectedAccount || !config.projectSlug || !config.labelId) {
      return summary('blocked', 'mailbox_scope_unconfigured');
    }
    const project = await deps.project(config.projectSlug);
    if (!project || !project.id || project.slug !== config.projectSlug || project.status !== 'active'
      || project.verification_enabled !== true || project.repo_provider !== 'github' || !REPO.test(project.repo_identifier)) {
      return summary('blocked', 'project_scope_unavailable');
    }
    const scope = await deps.probe();
    if (scope.accountId !== config.expectedAccount || scope.projectSlug !== config.projectSlug || scope.labelId !== config.labelId) {
      return summary('blocked', 'mailbox_scope_mismatch');
    }
    const retain = async (messageKey: string, type: 'github_mail_intake' | 'github_mail_observation', payload: Record<string, unknown>) => {
      const event = await deps.persist({
        provider: 'control-room', projectId: project.id,
        providerEventId: 'github-mail:v1:' + fingerprint([type, messageKey, payload]),
        eventType: type, resourceType: 'github_mail_notification', resourceId: messageKey, payload,
      });
      if (!event.id) throw new Error('github_inbox_receipt_missing');
      if (event.isDuplicate) duplicates += 1;
      else inserted += 1;
    };
    const seenMessages = new Set<string>();
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      const page = await deps.read({ maxResults: PAGE_SIZE, ...(pageToken ? { pageToken } : {}) });
      pages += 1;
      if (page.accountId !== scope.accountId || page.projectSlug !== scope.projectSlug
        || page.messages.length > PAGE_SIZE
        || page.messages.some(message => message.accountId !== scope.accountId || message.projectSlug !== scope.projectSlug
          || (message.projectId && message.projectId !== project.id))) {
        return summary('blocked', 'mailbox_page_scope_mismatch');
      }
      for (const message of page.messages) {
        const from = (message.from ?? '').trim().toLowerCase();
        const sender = (from.match(/<([^<>]+)>\s*$/)?.[1] ?? from).trim();
        const subjectRepo = message.subject.match(/^(?:Re:\s*)?\[([a-z0-9_.-]+\/[a-z0-9_.-]+)\]/i)?.[1]?.toLowerCase();
        if (!/^[a-z0-9.!#$%&'*+/=?^_~-]+@github\.com$/.test(sender)
          || (subjectRepo && subjectRepo !== project.repo_identifier.toLowerCase())) {
          outOfScope += 1;
          continue;
        }
        const decision = classifyAiInboxMessage(message);
        const accountNotice = !subjectRepo && decision.lane === 'money_security';
        if (!accountNotice && (!subjectRepo || !['ci_unverified', 'project_updates', 'money_security', 'human_action'].includes(decision.lane))) {
          outOfScope += 1;
          continue;
        }
        const key = fingerprint([scope.accountId, scope.labelId, project.id, message.providerMessageId]);
        if (seenMessages.has(key)) continue;
        seenMessages.add(key);
        await retain(key, 'github_mail_intake', {
          scope: accountNotice ? 'account' : 'repository', lane: decision.lane,
          evidence: 'message_only', resolution: 'unverified', reviewRequired: true,
        });
        if (accountNotice) continue;
        const observed = await reconcileGithubInboxMessage(message, project, deps.reader);
        if (observed) {
          await retain(key, 'github_mail_observation', {
            ...observed,
            ...(observed.checkCounts ? { checkCounts: normalizedCounts(observed.checkCounts) } : {}),
            ...(observed.reviewCounts ? { reviewCounts: normalizedCounts(observed.reviewCounts) } : {}),
          });
        }
      }
      pageToken = page.nextPageToken ?? undefined;
      if (pageToken && seenTokens.has(pageToken)) return summary('blocked', 'pagination_repeated');
      if (pageToken) seenTokens.add(pageToken);
    } while (pageToken && pages < MAX_PAGES);
    coverage = pageToken ? 'truncated' : 'bounded_inbox';
    return summary('observed', 'intake_only_no_resolution');
  } catch {
    return summary('failed', 'watch_cycle_failed');
  }
}

/** Uses the existing read-only scoped Gmail adapter, provider factory and FCR event inbox.
 * Opt-in is deliberately separate from the on-demand Gmail configuration.
 */
export async function runConfiguredGithubInboxWatch(now = new Date()) {
  if (process.env.FCR_GMAIL_GITHUB_WATCH_ENABLED !== 'true' || now.getUTCMinutes() !== 0) {
    return { status: 'skipped', reason: 'disabled_or_not_due' };
  }
  const [
    { gmailInboxReadStatus, probeGmailInbox, readGmailInbox },
    { providerForProject },
    { persistProviderEvent },
    { supabase },
  ] = await Promise.all([
    import('./growthInboxReply.js'),
    import('../providers/providerFactory.js'),
    import('../events/inbox.js'),
    import('./supabaseClient.js'),
  ]);
  return runGithubInboxWatch(true, now, {
    status: gmailInboxReadStatus,
    probe: probeGmailInbox,
    read: readGmailInbox,
    reader: providerForProject,
    persist: persistProviderEvent,
    async project(slug) {
      const { data, error } = await supabase.from('projects')
        .select('id,slug,repo_provider,repo_identifier,status,verification_enabled')
        .eq('slug', slug).maybeSingle();
      if (error) throw new Error('github_inbox_project_lookup_failed');
      return data as GithubInboxProject | null;
    },
  });
}
