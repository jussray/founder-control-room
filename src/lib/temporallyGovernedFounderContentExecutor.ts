import {
  dispatchFirstPartyFounderContentPublishNow,
  type FirstPartyFounderPublishInput,
  type FirstPartyFounderPublishOptions,
  type FirstPartyFounderPublishResult,
} from './firstPartyFounderContentExecutor.js';
import {
  TEMPORAL_CLAIM_CLASSES,
  buildTemporalClaimTruthContextFromCanonical,
  revalidateTemporalPublicClaims,
  temporalTruthAnalytics,
  type CanonicalPublicClaim,
  type RepositoryTruthResolver,
  type TemporalClaimClass,
  type TemporalClaimTruthReceipt,
} from '../governance/temporalClaimTruth.js';
// @ts-expect-error -- canonical founder-content authority intentionally remains the CommonJS firewall contract.
import founderContentAuthorizationContract from '../../tools/zapier/founder-content-authorization-contract.cjs';

type JsonRecord = Record<string, unknown>;

interface CanonicalFounderContentContract {
  authorizeFounderContentPublication(input: {
    proposal: JsonRecord;
    approval: JsonRecord;
    now: string;
  }): JsonRecord;
  canonicalChiefIdentity(proposal: JsonRecord): JsonRecord;
}

const canonicalFounderContent = founderContentAuthorizationContract as CanonicalFounderContentContract;

export interface TemporallyGovernedFounderPublishInput extends FirstPartyFounderPublishInput {
  confirmation: FirstPartyFounderPublishInput['confirmation'] & { truth_context_hash?: string };
}

export interface TemporallyGovernedFounderPublishOptions extends FirstPartyFounderPublishOptions {
  truthResolver?: RepositoryTruthResolver;
}

export interface TemporallyGovernedFounderPublishResult extends FirstPartyFounderPublishResult {
  temporalTruth: TemporalClaimTruthReceipt | null;
  temporalAnalytics: ReturnType<typeof temporalTruthAnalytics> | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function temporalClass(value: unknown): TemporalClaimClass | null {
  const candidate = text(value).toLowerCase() as TemporalClaimClass;
  return TEMPORAL_CLAIM_CLASSES.includes(candidate) ? candidate : null;
}

async function defaultTruthResolver(): Promise<RepositoryTruthResolver> {
  const [{ supabase }, { providerForProject }] = await Promise.all([
    import('./supabaseClient.js'),
    import('../providers/providerFactory.js'),
  ]);
  return {
    async currentVersion(sourceRepo: string) {
      const { data, error } = await supabase
        .from('projects')
        .select('slug, repo_provider, repo_identifier')
        .eq('repo_identifier', sourceRepo)
        .limit(2);
      if (error || !data || data.length !== 1) {
        throw new Error(error?.message ?? 'source repository must resolve to exactly one project');
      }
      const project = data[0] as { slug: string; repo_provider: string; repo_identifier: string };
      const provider = providerForProject(project);
      const repo = await provider.getProject(project.slug);
      return provider.resolveRef(project.slug, repo.defaultBranch);
    },
  };
}

function blocked(
  base: FirstPartyFounderPublishResult,
  temporalTruth: TemporalClaimTruthReceipt | null,
  reasons: string[],
): TemporallyGovernedFounderPublishResult {
  return {
    ...base,
    ok: false,
    code: 'INVALID_AUTHORIZATION',
    status: 409,
    truthState: 'BLOCKED',
    published: false,
    executionId: null,
    receipt: null,
    providerEvidence: null,
    reasons,
    temporalTruth,
    temporalAnalytics: temporalTruth ? temporalTruthAnalytics(temporalTruth) : null,
  };
}

export async function dispatchTemporallyGovernedFounderContentPublishNow(
  input: TemporallyGovernedFounderPublishInput,
  options: TemporallyGovernedFounderPublishOptions = {},
): Promise<TemporallyGovernedFounderPublishResult> {
  const now = options.now ?? new Date().toISOString();
  const emptyBase: FirstPartyFounderPublishResult = {
    ok: false,
    code: 'INVALID_AUTHORIZATION',
    status: 409,
    contract: 'fcr/first-party-founder-content-publish@v1',
    truthState: 'BLOCKED',
    published: false,
    retrySafe: false,
    freshApprovalMayRetry: false,
    executionId: null,
    receipt: null,
    providerEvidence: null,
    reasons: [],
  };

  let authorization: JsonRecord;
  let identity: JsonRecord;
  try {
    authorization = canonicalFounderContent.authorizeFounderContentPublication({
      proposal: input.proposal,
      approval: input.approval,
      now,
    });
    identity = canonicalFounderContent.canonicalChiefIdentity(input.proposal);
  } catch (error) {
    return blocked(emptyBase, null, [
      error instanceof Error ? error.message : 'canonical founder-content authorization failed',
    ]);
  }

  const source = record(authorization.source);
  const payload = record(identity.public_payload);
  const claimsRaw = Array.isArray(payload.public_claims) ? payload.public_claims : [];
  const canonicalClaims: CanonicalPublicClaim[] = [];
  const classificationErrors: string[] = [];

  for (const claim of claimsRaw) {
    const value = record(claim);
    const claimId = text(value.claim_id).toLowerCase();
    const claimTemporalClass = temporalClass(value.temporal_class);
    const temporalVersion = text(value.temporal_version).toLowerCase() || null;
    if (!claimTemporalClass) {
      classificationErrors.push(`${claimId || '<missing>'}: canonical temporal_class is required for direct publication`);
      continue;
    }
    canonicalClaims.push({
      claimId,
      text: text(value.text),
      evidenceRef: text(value.evidence_ref),
      evidenceScope: text(value.evidence_scope),
      temporalClass: claimTemporalClass,
      temporalVersion,
    });
  }

  if (classificationErrors.length > 0 || canonicalClaims.length !== claimsRaw.length || canonicalClaims.length === 0) {
    return blocked(emptyBase, null, [
      'direct publication is fail-closed until every approved public claim has proposal-bound temporal semantics',
      ...classificationErrors,
    ]);
  }

  const temporalContext = buildTemporalClaimTruthContextFromCanonical({
    proposalHash: text(authorization.proposal_hash),
    publicPayloadHash: text(authorization.public_payload_hash),
    claims: canonicalClaims,
  });

  const needsRepoRead = canonicalClaims.some((claim) => claim.temporalClass === 'current_repo_state');
  const resolver = options.truthResolver ?? (needsRepoRead
    ? await defaultTruthResolver()
    : { currentVersion: async () => { throw new Error('repository read is not required for this claim set'); } });

  const temporalTruth = await revalidateTemporalPublicClaims({
    context: temporalContext,
    canonicalClaims,
    sourceRepo: text(source.repo),
    sourceCommitSha: text(source.commit_sha),
    expectedProposalHash: text(authorization.proposal_hash),
    expectedPublicPayloadHash: text(authorization.public_payload_hash),
    confirmationTruthContextHash: text(input.confirmation.truth_context_hash),
    resolver,
    now: new Date(now),
  });

  if (!temporalTruth.publishSafe) {
    const reasons = temporalTruth.claims
      .filter((claim) => !claim.publishSafe)
      .map((claim) => `${claim.claimId}: ${claim.displayLabel}`);
    return blocked(emptyBase, temporalTruth, [
      'publication stopped because one or more approved claims are not proven valid for their proposal-bound temporal class',
      ...reasons,
    ]);
  }

  const result = await dispatchFirstPartyFounderContentPublishNow(input, options);
  return {
    ...result,
    providerEvidence: result.providerEvidence
      ? { ...result.providerEvidence, temporalTruth: temporalTruthAnalytics(temporalTruth) }
      : { temporalTruth: temporalTruthAnalytics(temporalTruth) },
    temporalTruth,
    temporalAnalytics: temporalTruthAnalytics(temporalTruth),
  };
}
