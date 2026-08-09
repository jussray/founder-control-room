import { createHash } from 'node:crypto';

export const FOUNDER_CONVEYOR_CONTRACT = 'founder-control-room/n8n-conveyor@v3' as const;
export const FOUNDER_CONVEYOR_ADVANCE_EVENT = 'conveyor.stage.advance' as const;
export const FOUNDER_CONVEYOR_ACCEPTED_EVENT = 'conveyor.stage.accepted' as const;
export const FOUNDER_CONVEYOR_IDEMPOTENCY_PREFIX = 'fcr-conveyor-v3:' as const;
export const FOUNDER_CONVEYOR_RECEIPT_PREFIX = 'fcr-conveyor-receipt-v3:' as const;

export interface FounderConveyorReceiptIdentity {
  idempotencyKey: string;
  runId: string;
  projectSlug: string;
  goal: string;
  expectedHeadSha: string;
  fromStage: string;
  toStage: string;
  capabilityPlanHash: string;
  registryHash: string;
  skillIds: readonly string[];
  evidenceUrls: readonly string[];
}

function normalizedStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function founderConveyorReceiptSeed(identity: FounderConveyorReceiptIdentity): string {
  return JSON.stringify([
    identity.idempotencyKey.trim(),
    identity.runId.trim(),
    identity.projectSlug.trim(),
    identity.goal.trim(),
    identity.expectedHeadSha.trim().toLowerCase(),
    identity.fromStage,
    identity.toStage,
    identity.capabilityPlanHash.trim().toLowerCase(),
    identity.registryHash.trim().toLowerCase(),
    normalizedStrings(identity.skillIds),
    normalizedStrings(identity.evidenceUrls),
  ]);
}

export function founderConveyorReceiptId(identity: FounderConveyorReceiptIdentity): string {
  const digest = createHash('sha256').update(founderConveyorReceiptSeed(identity)).digest('hex');
  return `${FOUNDER_CONVEYOR_RECEIPT_PREFIX}${digest}`;
}
