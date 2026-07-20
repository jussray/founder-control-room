/**
 * Reconciliation Dispatcher — founder-control-room
 *
 * Triggers reconciliation runs on demand or on a schedule.
 * Calls each service's reconciliation endpoint (or runs the script directly
 * in CI) and publishes the result to the event bus inbox.
 *
 * Usage:
 *   import { dispatchReconciliation } from './dispatcher.js';
 *   await dispatchReconciliation(inbox, ['sekret-bip', 'l99-story-engine']);
 */
import type { ServiceName } from './types.js';
import type { Inbox } from '../events/inbox.js';

/**
 * Service endpoint registry.
 * In production: set via environment variables.
 * In CI: override with localhost URLs.
 */
const SERVICE_RECONCILE_URLS: Record<ServiceName, string> = {
  'founder-control-room': process.env.SELF_RECONCILE_URL ?? 'http://localhost:3000/api/reconcile',
  'sekret-bip': process.env.SEKRET_BIP_RECONCILE_URL ?? 'http://localhost:8787/reconcile',
  'l99-story-engine': process.env.L99_RECONCILE_URL ?? 'http://localhost:4000/reconcile',
};

export type DispatchResult = {
  service: ServiceName;
  ok: boolean;
  eventId?: string;
  error?: string;
};

/**
 * Fire-and-collect: triggers reconciliation on each service,
 * then publishes each DriftReport to the inbox.
 */
export async function dispatchReconciliation(
  inbox: Inbox,
  services: ServiceName[] = ['sekret-bip', 'l99-story-engine', 'founder-control-room']
): Promise<DispatchResult[]> {
  const results = await Promise.allSettled(
    services.map(service => triggerService(service, inbox))
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return { service: services[i], ok: false, error: String(r.reason) };
  });
}

async function triggerService(service: ServiceName, inbox: Inbox): Promise<DispatchResult> {
  const url = SERVICE_RECONCILE_URLS[service];

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Source': 'control-room' },
      signal: AbortSignal.timeout(15_000), // 15s max per service
    });

    if (!res.ok) {
      return { service, ok: false, error: `HTTP ${res.status} from ${url}` };
    }

    const report = await res.json();

    // Publish to inbox so the consumer handles persistence + outbox forwarding
    await inbox.publish('reconciliation.report', report);

    return { service, ok: true };
  } catch (e) {
    return { service, ok: false, error: String(e) };
  }
}
