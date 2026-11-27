import type { AiInboxMessage } from './aiInboxRouting.js';
import type { RepositoryProvider } from '../providers/RepositoryProvider.js';

export interface GithubInboxProject {
  id: string;
  slug: string;
  repo_provider: string;
  repo_identifier: string;
  status: string;
  verification_enabled: boolean;
}
type Reader = Pick<RepositoryProvider, 'resolveRef' | 'listVerificationSignals' | 'observePullRequest' | 'listReviewSignals'>;
type Result = {
  status: 'observed' | 'blocked' | 'stale';
  reason: string;
  resolution: 'unverified';
  repository?: string;
  headSha?: string;
  prNumber?: number;
  prState?: 'open' | 'closed';
  merged?: boolean;
  draft?: boolean;
  checkCounts?: Record<string, number>;
  reviewCounts?: Record<string, number>;
};

const SHA = /^[a-f0-9]{40}$/i;
const REPOSITORY = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
function safeBranch(value: string): boolean {
  return /^[a-z0-9][a-z0-9_./-]{0,199}$/i.test(value)
    && !value.includes('..') && !value.includes('//')
    && !value.endsWith('/') && !value.endsWith('.')
    && value.split('/').every(part => !part.startsWith('.') && !part.endsWith('.lock'));
}

type Target = { kind: 'pr'; number: number } | { kind: 'branch'; branch: string; prefix: string } | { kind: 'ambiguous' };

function parseTarget(subject: string): Target {
  const pr = subject.match(/\(PR #([1-9]\d{0,9})\)$/i);
  if (pr) return { kind: 'pr', number: Number(pr[1]) };
  // A PR workflow notification's title is not a branch, even if it looks like one.
  if (/^PR run /i.test(subject)) return { kind: 'ambiguous' };
  const run = subject.match(/^Run (?:failed|cancelled|canceled|skipped|succeeded|timed out|action required): .+ - ([^ ]+) \(([a-f0-9]{7,40})\)$/i);
  if (run && safeBranch(run[1])) return { kind: 'branch', branch: run[1], prefix: run[2].toLowerCase() };
  return { kind: 'ambiguous' };
}

function counts(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function held(status: 'blocked' | 'stale', reason: string, repository?: string): Result {
  return { status, reason, resolution: 'unverified', ...(repository ? { repository } : {}) };
}

/**
 * Read-only reconciliation of Gmail header hints against a pinned registered
 * project. Sender headers and abbreviated SHAs are never execution authority.
 * A provider snapshot is diagnostic, not proof of closure or merge eligibility.
 */
export async function reconcileGithubInboxMessage(
  message: AiInboxMessage,
  project: GithubInboxProject,
  makeReader: (project: GithubInboxProject) => Reader,
): Promise<Result | null> {
  const from = (message.from ?? '').trim().toLowerCase();
  const sender = (from.match(/<([^<>]+)>\s*$/)?.[1] ?? from).trim();
  if (!/^[a-z0-9.!#$%&'*+/=?^_~-]+@github\.com$/.test(sender)) return null;
  const match = message.subject.match(/^(?:Re:\s*)?\[([a-z0-9_.-]+\/[a-z0-9_.-]+)\]\s+(.+)$/i);
  if (!match) return null;
  const repository = match[1].toLowerCase();
  if (!project.id || project.status !== 'active' || project.verification_enabled !== true
    || project.repo_provider !== 'github' || !REPOSITORY.test(project.repo_identifier)
    || project.repo_identifier.toLowerCase() !== repository || project.slug !== message.projectSlug
    || (message.projectId && message.projectId !== project.id)) return held('blocked', 'project_scope_mismatch');
  const target = parseTarget(match[2]);
  if (target.kind === 'ambiguous') return held('blocked', 'exact_target_missing', repository);

  try {
    const provider = makeReader(project);
    let head: string;
    let recheck: () => Promise<boolean>;
    let prFields: Partial<Result> = {};
    let reviewCounts: Record<string, number> | undefined;
    if (target.kind === 'pr') {
      if (!provider.observePullRequest || !provider.listReviewSignals) return held('blocked', 'review_read_unavailable', repository);
      const pr = await provider.observePullRequest(project.slug, target.number);
      if (pr.number !== target.number || pr.repository.toLowerCase() !== repository
        || pr.headRepository.toLowerCase() !== repository || !SHA.test(pr.headSha) || !SHA.test(pr.baseSha)) {
        return held('blocked', 'provider_identity_mismatch', repository);
      }
      head = pr.headSha.toLowerCase();
      prFields = { prNumber: pr.number, prState: pr.state, draft: pr.draft, merged: pr.merged };
      const reviews = await provider.listReviewSignals(project.slug, pr.number);
      reviewCounts = counts(reviews.filter(review => review.commitSha.toLowerCase() === head).map(review => review.state));
      recheck = async () => {
        const current = await provider.observePullRequest!(project.slug, pr.number);
        return current.number === pr.number && current.repository.toLowerCase() === repository
          && current.headRepository.toLowerCase() === repository
          && current.headSha.toLowerCase() === head && current.baseSha.toLowerCase() === pr.baseSha.toLowerCase()
          && current.state === pr.state && current.draft === pr.draft && current.merged === pr.merged;
      };
    } else {
      head = (await provider.resolveRef(project.slug, target.branch)).toLowerCase();
      if (!SHA.test(head)) return held('blocked', 'provider_identity_mismatch', repository);
      if (!head.startsWith(target.prefix)) return held('stale', 'notification_head_not_current', repository);
      recheck = async () => (await provider.resolveRef(project.slug, target.branch)).toLowerCase() === head;
    }
    const checks = await provider.listVerificationSignals(project.slug, head);
    if (checks.some(check => check.commitSha.toLowerCase() !== head)) return held('blocked', 'mixed_head_checks', repository);
    if (!await recheck()) return held('stale', 'head_moved_during_readback', repository);
    return {
      status: 'observed', reason: 'exact_head_snapshot_only', resolution: 'unverified',
      repository, headSha: head, ...prFields, checkCounts: counts(checks.map(check => check.status)),
      ...(reviewCounts ? { reviewCounts } : {}),
    };
  } catch {
    return held('blocked', 'provider_read_failed', repository);
  }
}
