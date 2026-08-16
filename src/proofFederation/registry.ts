import {
  assertFederatedReceiptAcknowledgement,
  FederatedProofContractError,
  type FederatedProofReceipt,
  validateFederatedProofReceipt,
} from './contract.js';

export interface FederatedDanglingReference {
  receiptId: string;
  relation: 'acknowledges' | 'dependsOn' | 'supersedes';
  targetReceiptId: string;
}

export interface FederatedProofView {
  receipts: FederatedProofReceipt[];
  activeReceipts: FederatedProofReceipt[];
  supersededReceiptIds: string[];
  danglingReferences: FederatedDanglingReference[];
  acknowledgedBy: Record<string, string[]>;
  latestByAuthority: Record<string, FederatedProofReceipt>;
}

function sameReceipt(left: FederatedProofReceipt, right: FederatedProofReceipt): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function authorityKey(receipt: FederatedProofReceipt): string {
  return [
    receipt.project,
    receipt.authority.provider,
    receipt.authority.scope,
    receipt.authority.target,
    receipt.operation,
  ].join('|');
}

function assertDependency(receipt: FederatedProofReceipt, upstream: FederatedProofReceipt): void {
  if (receipt.project !== upstream.project) {
    throw new FederatedProofContractError('dependency_project_mismatch');
  }
  if (receipt.exactTarget.sha && upstream.exactTarget.sha && receipt.exactTarget.sha !== upstream.exactTarget.sha) {
    throw new FederatedProofContractError('dependency_sha_mismatch');
  }
}

function assertReferenceTime(receipt: FederatedProofReceipt, target: FederatedProofReceipt): void {
  if (Date.parse(target.issuedAt) > Date.parse(receipt.issuedAt)) {
    throw new FederatedProofContractError('reference_time_reversal');
  }
}

function assertSupersession(receipt: FederatedProofReceipt, superseded: FederatedProofReceipt): void {
  if (authorityKey(receipt) !== authorityKey(superseded)) {
    throw new FederatedProofContractError('supersession_authority_mismatch');
  }
  assertReferenceTime(receipt, superseded);
}

function assertAcyclicLineage(edges: Map<string, Set<string>>): void {
  const state = new Map<string, 'visiting' | 'visited'>();

  const visit = (receiptId: string): void => {
    const current = state.get(receiptId);
    if (current === 'visiting') {
      throw new FederatedProofContractError('receipt_lineage_cycle');
    }
    if (current === 'visited') return;

    state.set(receiptId, 'visiting');
    for (const target of edges.get(receiptId) ?? []) visit(target);
    state.set(receiptId, 'visited');
  };

  for (const receiptId of edges.keys()) visit(receiptId);
}

export function buildFederatedProofView(inputs: unknown[]): FederatedProofView {
  const byId = new Map<string, FederatedProofReceipt>();

  for (const input of inputs) {
    const receipt = validateFederatedProofReceipt(input);
    const existing = byId.get(receipt.receiptId);
    if (existing && !sameReceipt(existing, receipt)) {
      throw new FederatedProofContractError('receipt_id_conflict');
    }
    byId.set(receipt.receiptId, receipt);
  }

  const receipts = [...byId.values()].sort((left, right) => {
    const time = Date.parse(left.issuedAt) - Date.parse(right.issuedAt);
    return time || left.receiptId.localeCompare(right.receiptId);
  });
  const superseded = new Set<string>();
  const danglingReferences: FederatedDanglingReference[] = [];
  const acknowledgedBy: Record<string, string[]> = {};
  const lineageEdges = new Map<string, Set<string>>();

  for (const receipt of receipts) {
    lineageEdges.set(receipt.receiptId, new Set());
    const relations: Array<['acknowledges' | 'dependsOn' | 'supersedes', string[]]> = [
      ['acknowledges', receipt.acknowledges],
      ['dependsOn', receipt.dependsOn],
      ['supersedes', receipt.supersedes],
    ];

    for (const [relation, references] of relations) {
      for (const targetReceiptId of references) {
        const target = byId.get(targetReceiptId);
        if (!target) {
          danglingReferences.push({ receiptId: receipt.receiptId, relation, targetReceiptId });
          continue;
        }

        assertReferenceTime(receipt, target);
        lineageEdges.get(receipt.receiptId)?.add(targetReceiptId);

        if (relation === 'acknowledges') {
          assertFederatedReceiptAcknowledgement(receipt, target);
          acknowledgedBy[targetReceiptId] ??= [];
          acknowledgedBy[targetReceiptId].push(receipt.receiptId);
          continue;
        }
        if (relation === 'dependsOn') {
          assertDependency(receipt, target);
          continue;
        }

        assertSupersession(receipt, target);
        superseded.add(targetReceiptId);
      }
    }
  }

  assertAcyclicLineage(lineageEdges);

  const activeReceipts = receipts.filter((receipt) => !superseded.has(receipt.receiptId));
  const latestByAuthority: Record<string, FederatedProofReceipt> = {};
  for (const receipt of activeReceipts) {
    const key = authorityKey(receipt);
    const current = latestByAuthority[key];
    if (!current || Date.parse(receipt.issuedAt) >= Date.parse(current.issuedAt)) {
      latestByAuthority[key] = receipt;
    }
  }

  return {
    receipts,
    activeReceipts,
    supersededReceiptIds: [...superseded].sort(),
    danglingReferences,
    acknowledgedBy,
    latestByAuthority,
  };
}
