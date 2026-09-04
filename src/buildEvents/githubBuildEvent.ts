import {
  createBuildEvent,
  type BuildEvent,
  type BuildEventInput,
  type BuildEventStatus,
} from './buildEvent.js';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sha(value: unknown): string | undefined {
  const candidate = text(value);
  return candidate
    && /^[0-9a-f]{40}$/i.test(candidate)
    && !/^0{40}$/.test(candidate)
    ? candidate.toLowerCase()
    : undefined;
}

function eventRef(deliveryId: string): string[] {
  return [`github-delivery:${deliveryId}`];
}

function branchFromRef(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  return candidate.startsWith('refs/heads/') ? candidate.slice('refs/heads/'.length) : candidate;
}

function conclusionStatus(conclusion: unknown, status: unknown): BuildEventStatus {
  const normalizedConclusion = text(conclusion)?.toLowerCase();
  if (normalizedConclusion === 'success') return 'passed';
  if (['failure', 'timed_out', 'action_required', 'startup_failure'].includes(normalizedConclusion ?? '')) {
    return 'failed';
  }
  if (['cancelled', 'skipped', 'neutral', 'stale'].includes(normalizedConclusion ?? '')) {
    return 'blocked';
  }

  const normalizedStatus = text(status)?.toLowerCase();
  if (normalizedStatus === 'in_progress') return 'running';
  if (normalizedStatus === 'queued' || normalizedStatus === 'requested' || normalizedStatus === 'waiting') {
    return 'pending';
  }
  if (normalizedStatus === 'completed') return 'completed';
  return 'unknown';
}

function deploymentStatus(value: unknown): BuildEventStatus {
  switch (text(value)?.toLowerCase()) {
    case 'success':
      return 'passed';
    case 'failure':
    case 'error':
      return 'failed';
    case 'pending':
    case 'queued':
      return 'pending';
    case 'in_progress':
      return 'running';
    case 'inactive':
      return 'blocked';
    default:
      return 'unknown';
  }
}

function repositoryName(payload: JsonRecord): string | undefined {
  return text(asRecord(payload.repository)?.full_name);
}

function build(
  deliveryId: string,
  occurredAt: string,
  input: Omit<BuildEventInput, 'eventId' | 'occurredAt' | 'source' | 'truth' | 'authority' | 'evidenceRefs'>,
): BuildEvent {
  return createBuildEvent({
    eventId: `github:${deliveryId}`,
    occurredAt,
    source: 'github',
    truth: 'verified',
    authority: 'observed',
    evidenceRefs: eventRef(deliveryId),
    ...input,
  });
}

export function githubWebhookToBuildEvent(
  eventType: string,
  deliveryId: string,
  payload: JsonRecord,
  occurredAt = new Date().toISOString(),
): BuildEvent | null {
  const repository = repositoryName(payload);
  if (!repository) return null;

  if (eventType === 'push') {
    const commitSha = sha(payload.after);
    const branch = branchFromRef(payload.ref);
    if (!commitSha || !branch) return null;

    return build(deliveryId, occurredAt, {
      category: 'source',
      phase: 'build',
      status: 'completed',
      repository: {
        name: repository,
        branch,
        refKind: 'branch-head',
        commitSha,
      },
      evidenceUrls: text(payload.compare) ? [text(payload.compare)!] : [],
    });
  }

  if (eventType === 'pull_request') {
    const pullRequest = asRecord(payload.pull_request);
    const head = asRecord(pullRequest?.head);
    const base = asRecord(pullRequest?.base);
    const headSha = sha(head?.sha);
    const headBranch = branchFromRef(head?.ref);
    if (!pullRequest || !headSha || !headBranch) return null;

    const merged = pullRequest.merged === true;
    const state = text(pullRequest.state)?.toLowerCase();

    if (merged) {
      const mergeCommitSha = sha(pullRequest.merge_commit_sha);
      const baseBranch = branchFromRef(base?.ref);
      if (!mergeCommitSha || !baseBranch) return null;

      return build(deliveryId, occurredAt, {
        category: 'source',
        phase: 'build',
        status: 'completed',
        repository: {
          name: repository,
          branch: baseBranch,
          refKind: 'branch-head',
          commitSha: mergeCommitSha,
          auditedCommitSha: headSha,
        },
        evidenceUrls: text(pullRequest.html_url) ? [text(pullRequest.html_url)!] : [],
      });
    }

    return build(deliveryId, occurredAt, {
      category: 'source',
      phase: 'build',
      status: state === 'closed' ? 'completed' : 'running',
      repository: {
        name: repository,
        branch: headBranch,
        refKind: 'proposal-head',
        commitSha: headSha,
      },
      evidenceUrls: text(pullRequest.html_url) ? [text(pullRequest.html_url)!] : [],
    });
  }

  if (eventType === 'check_run') {
    const checkRun = asRecord(payload.check_run);
    const headSha = sha(checkRun?.head_sha);
    const name = text(checkRun?.name);
    if (!checkRun || !headSha || !name) return null;
    const status = conclusionStatus(checkRun.conclusion, checkRun.status);

    return build(deliveryId, occurredAt, {
      category: 'verification',
      phase: 'verify',
      status,
      repository: { name: repository, refKind: 'detached', commitSha: headSha },
      verification: { kind: name, status, exactCommitSha: headSha },
      evidenceUrls: text(checkRun.details_url) ? [text(checkRun.details_url)!] : [],
    });
  }

  if (eventType === 'workflow_run') {
    const workflowRun = asRecord(payload.workflow_run);
    const headSha = sha(workflowRun?.head_sha);
    const name = text(workflowRun?.name);
    if (!workflowRun || !headSha || !name) return null;
    const status = conclusionStatus(workflowRun.conclusion, workflowRun.status);

    return build(deliveryId, occurredAt, {
      category: 'verification',
      phase: 'verify',
      status,
      repository: {
        name: repository,
        ...(text(workflowRun.head_branch) ? { branch: text(workflowRun.head_branch)! } : {}),
        refKind: 'detached',
        commitSha: headSha,
      },
      verification: { kind: name, status, exactCommitSha: headSha },
      evidenceUrls: text(workflowRun.html_url) ? [text(workflowRun.html_url)!] : [],
    });
  }

  if (eventType === 'deployment') {
    const deployment = asRecord(payload.deployment);
    const commitSha = sha(deployment?.sha);
    const id = text(deployment?.id)
      ?? (typeof deployment?.id === 'number' ? String(deployment?.id) : undefined);
    if (!deployment || !commitSha || !id) return null;

    return build(deliveryId, occurredAt, {
      category: 'provider',
      phase: 'deploy',
      status: 'completed',
      repository: { name: repository, refKind: 'detached', commitSha },
      provider: {
        name: 'github',
        resource: `deployment:${id}`,
        ...(text(deployment.environment) ? { environment: text(deployment.environment)! } : {}),
      },
    });
  }

  if (eventType === 'deployment_status') {
    const deployment = asRecord(payload.deployment);
    const deploymentStatusValue = asRecord(payload.deployment_status);
    const commitSha = sha(deployment?.sha);
    const id = text(deployment?.id)
      ?? (typeof deployment?.id === 'number' ? String(deployment?.id) : undefined);
    if (!deployment || !deploymentStatusValue || !commitSha || !id) return null;
    const status = deploymentStatus(deploymentStatusValue.state);

    return build(deliveryId, occurredAt, {
      category: 'provider',
      phase: 'deploy',
      status,
      repository: { name: repository, refKind: 'detached', commitSha },
      provider: {
        name: 'github',
        resource: `deployment:${id}`,
        ...(text(deployment.environment) ? { environment: text(deployment.environment)! } : {}),
      },
      evidenceUrls: text(deploymentStatusValue.environment_url)
        ? [text(deploymentStatusValue.environment_url)!]
        : [],
    });
  }

  return null;
}
