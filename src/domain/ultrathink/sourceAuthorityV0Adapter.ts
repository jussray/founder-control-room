import { evaluateSourceAuthority, type SourceAuthorityRecord } from './sourceAuthority.js';

export interface SourceAuthorityV0AdapterOutput {
  kind: 'source-authority.v0';
  repo: string;
  branch: 'main';
  authoritativeSha: string;
  observedAt: string;
  source: 'github';
  correlationId: string;
}

export function adaptSourceAuthorityRecordV0(
  record: SourceAuthorityRecord,
): SourceAuthorityV0AdapterOutput | null {
  const evaluation = evaluateSourceAuthority(record);

  if (
    evaluation.decision !== 'canonical'
    || record.decision !== 'canonical'
    || record.source.branch !== 'main'
    || !record.source.repository.trim()
    || !record.source.sha.trim()
    || !record.observedAt.trim()
  ) {
    return null;
  }

  return Object.freeze({
    kind: 'source-authority.v0',
    repo: record.source.repository,
    branch: 'main',
    authoritativeSha: record.source.sha,
    observedAt: record.observedAt,
    source: 'github',
    correlationId: `fcr-source-authority:${record.source.repository}:${record.source.sha}`,
  });
}
