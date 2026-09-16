import type { OperatorRelayResponseV1 } from './operatorRelay.js';

export function requireProviderEvidence(response: OperatorRelayResponseV1): string[] {
  const evidence = [...new Set(response.evidenceRefs.map((ref) => ref.trim()).filter(Boolean))];
  if (response.status === 'completed' && evidence.length === 0) {
    return ['completed relay response requires provider evidence'];
  }
  return [];
}
