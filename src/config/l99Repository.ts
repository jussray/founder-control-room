export const L99_PROJECT_SLUG = "l99";
export const L99_REPOSITORY_PROVIDER = "github";
export const L99_REPOSITORY_IDENTIFIER = "jussray/StoryEngine";

export interface L99RepositoryRecord {
  repo_provider?: string | null;
  repo_identifier?: string | null;
}

export function needsL99RepositoryReconciliation(
  record: L99RepositoryRecord,
): boolean {
  return (
    record.repo_provider !== L99_REPOSITORY_PROVIDER ||
    record.repo_identifier !== L99_REPOSITORY_IDENTIFIER
  );
}

export function buildL99RepositoryFields(updatedAt: string): {
  repo_provider: typeof L99_REPOSITORY_PROVIDER;
  repo_identifier: typeof L99_REPOSITORY_IDENTIFIER;
  updated_at: string;
} {
  return {
    repo_provider: L99_REPOSITORY_PROVIDER,
    repo_identifier: L99_REPOSITORY_IDENTIFIER,
    updated_at: updatedAt,
  };
}
