import { assessPilotExecution } from '../../scripts/fcr-paid-pilot-gate.mjs';

/** A read-only assessment, not proof of delivery, payment, or production authority. */
export function assessQuickScanSandboxPilot(founderAuthenticated: boolean, input: unknown) {
  if (!founderAuthenticated) return { allowed: false as const, reason: 'FOUNDER_AUTH_REQUIRED' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { allowed: false as const, reason: 'INVALID_INPUT' };
  return assessPilotExecution({ ...(input as Record<string, unknown>), authorized: true });
}
