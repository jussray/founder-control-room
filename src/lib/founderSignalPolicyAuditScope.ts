type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function repositoryOwnerAndName(value: string): [string, string] | null {
  const segments = value.split('/');
  if (segments.length !== 2) return null;
  const [owner, repository] = segments;
  return owner && repository ? [owner, repository] : null;
}

function connectionMatchesAllOwnedScope(config: unknown, sourceRepository: string): boolean {
  const repository = repositoryOwnerAndName(sourceRepository);
  if (!repository || !isRecord(config)) return false;

  const scope = config.repositoryScope;
  if (!isRecord(scope) || scope.mode !== 'all_owned') return false;

  const owner = boundedText(scope.owner, 39);
  return Boolean(owner) && owner?.toLowerCase() === repository[0].toLowerCase();
}

/**
 * Resolves a repository to one already-configured portfolio audit project.
 *
 * The caller is responsible for querying only active Git connections. This
 * helper never creates project rows and never widens scope beyond an exact
 * owner/repository identity. Multiple matching project IDs are treated as an
 * ambiguous authority configuration and fail closed.
 */
export function selectPortfolioPolicyAuditProjectId(
  connections: unknown,
  sourceRepository: string,
): string | null {
  if (!Array.isArray(connections) || !repositoryOwnerAndName(sourceRepository)) return null;

  const matchingIds = new Set<string>();
  for (const connection of connections) {
    if (!isRecord(connection)) continue;
    const projectId = boundedText(connection.project_id, 100);
    if (!projectId || !connectionMatchesAllOwnedScope(connection.config, sourceRepository)) continue;
    matchingIds.add(projectId);
  }

  if (matchingIds.size > 1) {
    throw new Error(`POLICY_PORTFOLIO_SCOPE_AMBIGUOUS:${sourceRepository}`);
  }

  return [...matchingIds][0] ?? null;
}
