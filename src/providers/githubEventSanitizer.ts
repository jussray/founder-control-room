function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringsOnly(values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === "string");
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function repositorySummary(payload: Record<string, unknown>): Record<string, unknown> {
  const repository = record(payload.repository);
  return {
    id: repository.id ?? null,
    full_name: typeof repository.full_name === "string" ? repository.full_name : null,
    private: repository.private === true,
    default_branch: typeof repository.default_branch === "string" ? repository.default_branch : null,
    archived: repository.archived === true,
  };
}

/**
 * Reduces a GitHub webhook to non-personal operational evidence.
 *
 * Deliberately excluded: commit messages, patches, PR title/body, comments,
 * sender/user/author/committer objects, email addresses, branch protection
 * secrets, raw deployment payloads, and any unknown provider fields.
 */
export function sanitizeGitHubEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const base = {
    repository: repositorySummary(payload),
    action: typeof payload.action === "string" ? payload.action : null,
  };

  switch (eventType) {
    case "check_run": {
      const check = record(payload.check_run);
      return {
        ...base,
        check_run: {
          id: check.id ?? null,
          name: typeof check.name === "string" ? check.name : null,
          status: typeof check.status === "string" ? check.status : null,
          conclusion: typeof check.conclusion === "string" ? check.conclusion : null,
          head_sha: typeof check.head_sha === "string" ? check.head_sha : null,
          started_at: typeof check.started_at === "string" ? check.started_at : null,
          completed_at: typeof check.completed_at === "string" ? check.completed_at : null,
          details_url: safeHttpsUrl(check.details_url),
        },
      };
    }
    case "pull_request": {
      const pullRequest = record(payload.pull_request);
      const baseRef = record(pullRequest.base);
      const headRef = record(pullRequest.head);
      return {
        ...base,
        pull_request: {
          number: pullRequest.number ?? payload.number ?? null,
          state: typeof pullRequest.state === "string" ? pullRequest.state : null,
          draft: pullRequest.draft === true,
          merged: pullRequest.merged === true,
          mergeable: typeof pullRequest.mergeable === "boolean" ? pullRequest.mergeable : null,
          base_ref: typeof baseRef.ref === "string" ? baseRef.ref : null,
          base_sha: typeof baseRef.sha === "string" ? baseRef.sha : null,
          head_ref: typeof headRef.ref === "string" ? headRef.ref : null,
          head_sha: typeof headRef.sha === "string" ? headRef.sha : null,
          additions: typeof pullRequest.additions === "number" ? pullRequest.additions : null,
          deletions: typeof pullRequest.deletions === "number" ? pullRequest.deletions : null,
          changed_files: typeof pullRequest.changed_files === "number" ? pullRequest.changed_files : null,
          html_url: safeHttpsUrl(pullRequest.html_url),
        },
      };
    }
    case "push":
      return {
        ...base,
        push: {
          ref: typeof payload.ref === "string" ? payload.ref : null,
          before: typeof payload.before === "string" ? payload.before : null,
          after: typeof payload.after === "string" ? payload.after : null,
          created: payload.created === true,
          deleted: payload.deleted === true,
          forced: payload.forced === true,
          commit_ids: Array.isArray(payload.commits)
            ? stringsOnly(payload.commits.map((commit) => record(commit).id))
            : [],
        },
      };
    case "workflow_run": {
      const run = record(payload.workflow_run);
      return {
        ...base,
        workflow_run: {
          id: run.id ?? null,
          name: typeof run.name === "string" ? run.name : null,
          event: typeof run.event === "string" ? run.event : null,
          status: typeof run.status === "string" ? run.status : null,
          conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
          head_branch: typeof run.head_branch === "string" ? run.head_branch : null,
          head_sha: typeof run.head_sha === "string" ? run.head_sha : null,
          run_number: typeof run.run_number === "number" ? run.run_number : null,
          html_url: safeHttpsUrl(run.html_url),
          created_at: typeof run.created_at === "string" ? run.created_at : null,
          updated_at: typeof run.updated_at === "string" ? run.updated_at : null,
        },
      };
    }
    case "deployment": {
      const deployment = record(payload.deployment);
      return {
        ...base,
        deployment: {
          id: deployment.id ?? null,
          ref: typeof deployment.ref === "string" ? deployment.ref : null,
          sha: typeof deployment.sha === "string" ? deployment.sha : null,
          task: typeof deployment.task === "string" ? deployment.task : null,
          environment: typeof deployment.environment === "string" ? deployment.environment : null,
          created_at: typeof deployment.created_at === "string" ? deployment.created_at : null,
          updated_at: typeof deployment.updated_at === "string" ? deployment.updated_at : null,
        },
      };
    }
    case "deployment_status": {
      const status = record(payload.deployment_status);
      const deployment = record(payload.deployment);
      return {
        ...base,
        deployment_status: {
          id: status.id ?? null,
          deployment_id: deployment.id ?? null,
          state: typeof status.state === "string" ? status.state : null,
          environment: typeof status.environment === "string" ? status.environment : null,
          environment_url: safeHttpsUrl(status.environment_url),
          log_url: safeHttpsUrl(status.log_url),
          created_at: typeof status.created_at === "string" ? status.created_at : null,
          updated_at: typeof status.updated_at === "string" ? status.updated_at : null,
        },
      };
    }
    default:
      return base;
  }
}
