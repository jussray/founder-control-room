import type { SourceAuthorityV0 } from '../../../packages/ultrathink-verification-core/src/source-authority.v0.js';
import { evaluateSourceAuthority, type SourceAuthorityRecord } from './sourceAuthority.js';

export function adaptSourceAuthorityRecordV0(
  record: SourceAuthorityRecord,
): SourceAuthorityV0 | null {
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
