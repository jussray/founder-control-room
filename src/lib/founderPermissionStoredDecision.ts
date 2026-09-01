import {
  resolveFounderPermissionRequest,
  type FounderPermissionRequest,
  type FounderPermissionStatus,
} from './founderPermissionBroker.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface StoredFounderPermissionDecisionSnapshot {
  status: FounderPermissionStatus;
  decision: unknown;
  decisionHash: unknown;
  decisionSurface: unknown;
}

/**
 * Reconstruct the canonical broker decision before a durable row can satisfy
 * founder permission. Stored JSON and hash columns are evidence, not authority.
 */
export function storedFounderPermissionDecisionMatches(
  request: FounderPermissionRequest,
  snapshot: StoredFounderPermissionDecisionSnapshot,
): boolean {
  if (!isRecord(snapshot.decision)) return false;
  const decisionValue = text(snapshot.decision.decision);
  if (!['approved', 'rejected', 'change_requested'].includes(decisionValue)) return false;

  let resolution;
  try {
    resolution = resolveFounderPermissionRequest({
      request,
      decision: decisionValue as 'approved' | 'rejected' | 'change_requested',
    });
  } catch {
    return false;
  }

  const expected = resolution.decision;
  return resolution.status === snapshot.status
    && text(snapshot.decisionSurface) === 'fcr'
    && text(snapshot.decisionHash).toLowerCase() === expected.decisionHash
    && text(snapshot.decision.contract) === expected.contract
    && text(snapshot.decision.requestHash).toLowerCase() === expected.requestHash
    && text(snapshot.decision.surface) === expected.surface
    && text(snapshot.decision.decision) === expected.decision
    && snapshot.decision.founderExplicit === true
    && snapshot.decision.executionAuthorized === false
    && text(snapshot.decision.decisionHash).toLowerCase() === expected.decisionHash;
}
