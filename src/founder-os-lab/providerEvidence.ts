import type {
  FounderOsLabEvidenceField,
  FounderOsLabProviderId,
} from './contracts.js';

/**
 * Concrete evidence fields that must exist before a mutating preview may be
 * described as ready for a separately governed external executor.
 *
 * Provider and destination receipts remain post-execution evidence and are
 * intentionally not treated as preflight inputs.
 */
export const FOUNDER_OS_LAB_PROVIDER_PREFLIGHT_EVIDENCE: Readonly<
  Record<FounderOsLabProviderId, readonly FounderOsLabEvidenceField[]>
> = {
  chatgpt: [],
  claude: [],
  codex: ['repository', 'commitSha', 'proofUrls'],
  perplexity: [],
  github: ['repository', 'commitSha', 'proofUrls'],
  supabase: ['repository', 'commitSha', 'proofUrls'],
  cloudflare: ['repository', 'commitSha', 'proofUrls'],
  zapier: ['commitSha', 'proofUrls'],
  figma: [],
  'openai-platform': [],
  hubspot: ['proofUrls'],
} as const;
