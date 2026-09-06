import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  createUltrathinkContinuityRecord,
  inspectUltrathinkContinuity,
  type EvidenceRef,
  type UltrathinkContinuityRecord,
} from '../src/lib/ultrathinkContinuity.js';
import {
  defaultUltrathinkContinuityStore,
  revokeUltrathinkContinuity,
  storeUltrathinkContinuity,
} from '../src/services/ultrathinkContinuityStore.js';

const REPOSITORY = 'jussray/founder-control-room';
const BRANCH = 'codex/provider-neutral-founder-content-contracts';
const NAMESPACE = 'fcr';
const MISSION_ID = 'ULTRATHINK-CONTINUITY-STORAGE-PROOF';
const EVIDENCE_PATH = 'src/lib/ultrathinkContinuity.ts';
const SHA = process.env.EXPECTED_HEAD_SHA ?? process.env.GITHUB_SHA ?? '';
const RUN_ID = process.env.GITHUB_RUN_ID ?? '';
const RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT ?? '1';

function requireMatch(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) throw new Error(`${label}_INVALID`);
  return value;
}

requireMatch(SHA, /^[0-9a-f]{40}$/i, 'ULTRATHINK_STORAGE_PROOF_HEAD_SHA');
requireMatch(RUN_ID, /^[0-9]{1,30}$/, 'ULTRATHINK_STORAGE_PROOF_RUN_ID');
requireMatch(RUN_ATTEMPT, /^[0-9]{1,6}$/, 'ULTRATHINK_STORAGE_PROOF_RUN_ATTEMPT');

const prefix = `storage:${SHA.slice(0, 12)}:${RUN_ID}:${RUN_ATTEMPT}`;
const rootId = `${prefix}:root`;
const leftId = `${prefix}:left`;
const rightId = `${prefix}:right`;
const now = new Date();
const observedAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
const createdAt = observedAt;

const evidenceBytes = await readFile(EVIDENCE_PATH);
const evidenceChecksum = `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`;
const evidenceRef: EvidenceRef = {
  kind: 'repo-file',
  ref: `repo-file:${EVIDENCE_PATH}@${SHA}`,
  checksum: evidenceChecksum,
};

const evidenceResolver = {
  async checksum(ref: EvidenceRef): Promise<string | null> {
    if (ref.kind !== evidenceRef.kind || ref.ref !== evidenceRef.ref) return null;
    const bytes = await readFile(EVIDENCE_PATH);
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  },
};

function checkpoint(
  continuationId: string,
  parent: UltrathinkContinuityRecord | null,
  evidence: EvidenceRef,
): UltrathinkContinuityRecord {
  return createUltrathinkContinuityRecord({
    namespace: NAMESPACE,
    missionId: MISSION_ID,
    continuationId,
    parent: parent ? { continuationId: parent.continuationId, stateHash: parent.stateHash } : null,
    createdAt,
    createdBy: 'founder:jussray',
    freshnessPolicyMs: 60_000,
    observedAt,
    authorityIdentity: {
      repo: REPOSITORY,
      branch: BRANCH,
      sha: SHA,
      runtime: null,
      externalRef: null,
    },
    evidenceRefs: [evidence],
    historicalReceiptStatus: 'verified',
    truthPlane: 'source',
  });
}

const root = checkpoint(rootId, null, evidenceRef);
await storeUltrathinkContinuity(root);

const storedRoot = await defaultUltrathinkContinuityStore.get(root.continuationId);
if (!storedRoot) throw new Error('ULTRATHINK_STORAGE_PROOF_ROOT_READBACK_MISSING');
if (storedRoot.stateHash !== root.stateHash) throw new Error('ULTRATHINK_STORAGE_PROOF_ROOT_HASH_MISMATCH');
if (storedRoot.historicalReceiptStatus !== 'verified') throw new Error('ULTRATHINK_STORAGE_PROOF_HISTORY_NOT_VERIFIED');
if (storedRoot.executionAuthority !== false || storedRoot.proofCookie.actionAuthority !== false) {
  throw new Error('ULTRATHINK_STORAGE_PROOF_AUTHORITY_TRANSFER_DETECTED');
}

const stale = await inspectUltrathinkContinuity(defaultUltrathinkContinuityStore, root.continuationId, {
  namespace: NAMESPACE,
  missionId: MISSION_ID,
  evidenceResolver,
  now,
});
if (stale.classification !== 'STALE') {
  throw new Error(`ULTRATHINK_STORAGE_PROOF_EXPECTED_STALE_GOT_${stale.classification}`);
}

const left = checkpoint(leftId, storedRoot, evidenceRef);
const right = checkpoint(rightId, storedRoot, evidenceRef);
await storeUltrathinkContinuity(left);
await storeUltrathinkContinuity(right);

const persistedChildren = await defaultUltrathinkContinuityStore.children(storedRoot.continuationId);
const persistedChildIds = new Set(persistedChildren.map((item) => item.continuationId));
if (!persistedChildIds.has(leftId) || !persistedChildIds.has(rightId)) {
  throw new Error('ULTRATHINK_STORAGE_PROOF_FORK_READBACK_INCOMPLETE');
}

const diverged = await inspectUltrathinkContinuity(defaultUltrathinkContinuityStore, left.continuationId, {
  namespace: NAMESPACE,
  missionId: MISSION_ID,
  evidenceResolver,
  now,
});
if (diverged.classification !== 'DIVERGED') {
  throw new Error(`ULTRATHINK_STORAGE_PROOF_EXPECTED_DIVERGED_GOT_${diverged.classification}`);
}

const revocationDisposition = await revokeUltrathinkContinuity(root.continuationId, {
  revokedAt: new Date(now.getTime() + 1_000).toISOString(),
  revokedBy: 'founder:jussray',
  reason: 'storage proof revocation blocks future continuation without rewriting historical receipt truth',
});
if (revocationDisposition !== 'stored') throw new Error('ULTRATHINK_STORAGE_PROOF_REVOCATION_NOT_STORED');

const revoked = await inspectUltrathinkContinuity(defaultUltrathinkContinuityStore, left.continuationId, {
  namespace: NAMESPACE,
  missionId: MISSION_ID,
  evidenceResolver,
  now: new Date(now.getTime() + 2_000),
});
if (revoked.classification !== 'REVOKED' || revoked.reasons[0] !== 'revoked_ancestor') {
  throw new Error(`ULTRATHINK_STORAGE_PROOF_EXPECTED_REVOKED_GOT_${revoked.classification}`);
}

const rootAfterRevocation = await defaultUltrathinkContinuityStore.get(root.continuationId);
if (!rootAfterRevocation) throw new Error('ULTRATHINK_STORAGE_PROOF_ROOT_LOST_AFTER_REVOCATION');
if (rootAfterRevocation.stateHash !== root.stateHash) throw new Error('ULTRATHINK_STORAGE_PROOF_HISTORY_REWRITTEN');
if (rootAfterRevocation.historicalReceiptStatus !== 'verified') {
  throw new Error('ULTRATHINK_STORAGE_PROOF_HISTORICAL_RECEIPT_ERASED');
}

const proof = {
  contract: 'fcr/ultrathink-continuity-storage-proof@v1',
  exactHeadSha: SHA,
  githubRunId: RUN_ID,
  githubRunAttempt: RUN_ATTEMPT,
  namespace: NAMESPACE,
  missionId: MISSION_ID,
  evidence: {
    kind: evidenceRef.kind,
    ref: evidenceRef.ref,
    storedChecksum: evidenceRef.checksum,
    independentlyResolvedChecksum: await evidenceResolver.checksum(evidenceRef),
  },
  persisted: {
    root: root.continuationId,
    left: left.continuationId,
    right: right.continuationId,
    revocation: root.continuationId,
  },
  classifications: {
    stale: stale.classification,
    diverged: diverged.classification,
    revoked: revoked.classification,
  },
  invariants: {
    historicalReceiptStatus: rootAfterRevocation.historicalReceiptStatus,
    historicalStateHashPreserved: rootAfterRevocation.stateHash === root.stateHash,
    continuityMayAuthorizeAction: false,
    executionAuthority: rootAfterRevocation.executionAuthority,
    proofCookieActionAuthority: rootAfterRevocation.proofCookie.actionAuthority,
    externalExecutionPerformed: false,
  },
  observedAt: now.toISOString(),
};

await writeFile('ultrathink-continuity-storage-proof.json', `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(proof, null, 2));
