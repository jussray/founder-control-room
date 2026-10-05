import { describe, expect, it, vi } from 'vitest';

import {
  CLOUDFLARE_RUNTIME_SIGNAL_CONTRACT,
  publishCloudflareRuntimeSignal,
} from '../cloudflareRuntimeSignal.js';

const SHA = 'a'.repeat(40);

function dependencies(options: { duplicate?: boolean; projectId?: string | null } = {}) {
  return {
    resolveProjectId: vi.fn().mockResolvedValue(
      options.projectId === undefined ? 'project-1' : options.projectId,
    ),
    persistEvent: vi.fn().mockResolvedValue({
      id: 'event-1',
      isDuplicate: options.duplicate ?? false,
    }),
    enqueue: vi.fn().mockResolvedValue('outbox-1'),
  };
}

describe('Cloudflare runtime signal publisher', () => {
  it('fails closed when the deployed runtime SHA is missing or malformed', async () => {
    const deps = dependencies();

    await expect(publishCloudflareRuntimeSignal({ gitSha: 'not-a-sha' }, deps)).resolves.toEqual({
      status: 'skipped',
      reason: 'runtime_sha_unavailable',
    });

    expect(deps.resolveProjectId).not.toHaveBeenCalled();
    expect(deps.persistEvent).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('does not publish when the authoritative FCR project is unavailable', async () => {
    const deps = dependencies({ projectId: null });

    await expect(publishCloudflareRuntimeSignal({ gitSha: SHA }, deps)).resolves.toEqual({
      status: 'skipped',
      reason: 'project_unavailable',
    });

    expect(deps.persistEvent).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('persists one bounded Cloudflare runtime receipt and enqueues reconciliation', async () => {
    const deps = dependencies();

    await expect(publishCloudflareRuntimeSignal({
      gitSha: SHA.toUpperCase(),
      environment: 'production',
    }, deps)).resolves.toEqual({
      status: 'stored',
      eventId: 'event-1',
      gitSha: SHA,
    });

    expect(deps.persistEvent).toHaveBeenCalledWith({
      provider: 'cloudflare',
      projectId: 'project-1',
      providerEventId: `worker-runtime:founder-control-room:${SHA}`,
      eventType: 'runtime_observed',
      resourceType: 'worker-deployment',
      resourceId: 'founder-control-room',
      payload: {
        contract: CLOUDFLARE_RUNTIME_SIGNAL_CONTRACT,
        service: 'founder-control-room',
        runtime: 'cloudflare-worker',
        environment: 'production',
        gitSha: SHA,
      },
    });
    expect(deps.enqueue).toHaveBeenCalledWith({
      projectId: 'project-1',
      controller: 'ProjectController',
      resourceId: 'founder-control-room',
      reason: 'provider_event',
      sourceEventId: 'event-1',
    });
  });

  it('deduplicates repeated observations of the same exact deployed SHA', async () => {
    const deps = dependencies({ duplicate: true });

    await expect(publishCloudflareRuntimeSignal({ gitSha: SHA }, deps)).resolves.toEqual({
      status: 'duplicate',
      eventId: 'event-1',
      gitSha: SHA,
    });

    expect(deps.persistEvent).toHaveBeenCalledTimes(1);
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});
