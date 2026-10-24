import {
  FederatedProofContractError,
  type FederatedProofReceipt,
  validateFederatedProofReceipt,
} from './contract.js';

export const BIP_FCR_CHIEF_EVIDENCE_CONTRACT = 'juss/bip-fcr-chief-evidence@v1' as const;
export const BIP_CONTROL_ROOM_PROJECT = 'jussray/Sekret-Bip' as const;
export const BIP_CONTROL_ROOM_ACTOR = 'sekret-bip-control-room' as const;

export const CHIEF_EVIDENCE_ONLY_AUTHORITY = Object.freeze({
  scope: 'evidence-only',
  instructionPolicy: 'data-only',
  permitsRepositoryWrite: false,
  permitsExecution: false,
  permitsDeployment: false,
  permitsPublishing: false,
  permitsBilling: false,
  permitsApproval: false,
  permitsSecretMutation: false,
  permitsDestructiveAction: false,
});

export type ChiefEvidenceState = 'verified' | 'unknown' | 'blocked';

export interface ChiefControlRoomEvidenceReceipt {
  schemaVersion: 1;
  id: string;
  workspaceId: 'juss';
  projectId: 'sekret-bip';
  sourceSystem: 'founder-control-room';
  sourceRecordId: string;
  sourceRevision: string;
  kind: 'workflow';
  subjectType: 'sekret-bip-control-room-proof';
  subjectId: string;
  subjectRef: string;
  state: ChiefEvidenceState;
  statement: string;
  sourceRefs: string[];
  status: 'active';
  supersedesReceiptId: string;
  observedAt: string;
  recordedAt: string;
  authority: typeof CHIEF_EVIDENCE_ONLY_AUTHORITY;
}

export interface ChiefControlRoomEvidenceIngestion {
  schemaVersion: 1;
  id: string;
  workspaceId: 'juss';
  projectId: 'sekret-bip';
  sourceSystem: 'founder-control-room';
  receiptIds: string[];
  evidence: Array<{
    state: ChiefEvidenceState;
    statement: string;
    sourceRefs: string[];
    receiptIds: string[];
    kinds: ['workflow'];
    observedFrom: string;
    observedTo: string;
  }>;
  authority: typeof CHIEF_EVIDENCE_ONLY_AUTHORITY;
  createdAt: string;
}

function chiefState(state: FederatedProofReceipt['state']): ChiefEvidenceState {
  if (state === 'verified') return 'verified';
  if (state === 'failed' || state === 'blocked') return 'blocked';
  return 'unknown';
}

function canonicalTimestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new FederatedProofContractError('invalid_bridge_timestamp');
  return parsed.toISOString();
}

function assertBipControlRoomReceipt(receipt: FederatedProofReceipt): void {
  if (receipt.project !== BIP_CONTROL_ROOM_PROJECT) {
    throw new FederatedProofContractError('bip_bridge_project_mismatch');
  }
  if (receipt.actor !== BIP_CONTROL_ROOM_ACTOR) {
    throw new FederatedProofContractError('bip_bridge_actor_mismatch');
  }
  if (
    receipt.authority.provider !== 'github'
    || receipt.authority.scope !== 'repository'
    || receipt.authority.target !== BIP_CONTROL_ROOM_PROJECT
    || receipt.authority.mode !== 'verify'
  ) {
    throw new FederatedProofContractError('bip_bridge_authority_mismatch');
  }
  if (
    receipt.exactTarget.repository !== BIP_CONTROL_ROOM_PROJECT
    || !receipt.exactTarget.sha
  ) {
    throw new FederatedProofContractError('bip_bridge_exact_target_mismatch');
  }
  if (receipt.operation !== 'exact_head_test_ledger') {
    throw new FederatedProofContractError('bip_bridge_operation_mismatch');
  }
  if (receipt.nextAuthority !== 'founder-control-room') {
    throw new FederatedProofContractError('bip_bridge_next_authority_mismatch');
  }
}

export function createBipChiefEvidenceReceipt(
  input: unknown,
  recordedAt: Date | string = new Date(),
): ChiefControlRoomEvidenceReceipt {
  const receipt = validateFederatedProofReceipt(input);
  assertBipControlRoomReceipt(receipt);

  const state = chiefState(receipt.state);
  const sha = receipt.exactTarget.sha as string;
  const recordedAtIso = canonicalTimestamp(recordedAt);
  if (Date.parse(recordedAtIso) < Date.parse(receipt.issuedAt)) {
    throw new FederatedProofContractError('bip_bridge_recorded_before_observed');
  }

  const sourceRefs = [
    `juss-proof:${receipt.receiptId}`,
    `github:${BIP_CONTROL_ROOM_PROJECT}@${sha}`,
    ...receipt.evidence.map((item) => item.ref).filter((item): item is string => Boolean(item)),
  ].filter((item, index, all) => all.indexOf(item) === index).slice(0, 20);

  return {
    schemaVersion: 1,
    id: `bip-fcr-${receipt.receiptId}`,
    workspaceId: 'juss',
    projectId: 'sekret-bip',
    sourceSystem: 'founder-control-room',
    sourceRecordId: receipt.receiptId,
    sourceRevision: sha,
    kind: 'workflow',
    subjectType: 'sekret-bip-control-room-proof',
    subjectId: sha,
    subjectRef: `github:${BIP_CONTROL_ROOM_PROJECT}@${sha}`,
    state,
    statement: `Se’kret Bip Control Room exact-head test ledger is ${state} for ${sha}.`,
    sourceRefs,
    status: 'active',
    supersedesReceiptId: '',
    observedAt: receipt.issuedAt,
    recordedAt: recordedAtIso,
    authority: CHIEF_EVIDENCE_ONLY_AUTHORITY,
  };
}

export function createBipChiefEvidenceIngestion(
  input: unknown,
  recordedAt: Date | string = new Date(),
): ChiefControlRoomEvidenceIngestion {
  const receipt = createBipChiefEvidenceReceipt(input, recordedAt);
  return {
    schemaVersion: 1,
    id: `bip-fcr-ingestion-${receipt.sourceRecordId}`,
    workspaceId: receipt.workspaceId,
    projectId: receipt.projectId,
    sourceSystem: 'founder-control-room',
    receiptIds: [receipt.id],
    evidence: [{
      state: receipt.state,
      statement: receipt.statement,
      sourceRefs: receipt.sourceRefs,
      receiptIds: [receipt.id],
      kinds: ['workflow'],
      observedFrom: receipt.observedAt,
      observedTo: receipt.observedAt,
    }],
    authority: CHIEF_EVIDENCE_ONLY_AUTHORITY,
    createdAt: receipt.recordedAt,
  };
}
