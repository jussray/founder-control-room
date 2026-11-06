import { beforeEach, describe, expect, it, vi } from 'vitest';

const { providerForProjectMock, supabaseMock } = vi.hoisted(() => ({
  providerForProjectMock: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../providers/providerFactory.js', () => ({
  providerForProject: providerForProjectMock,
}));

import { ManifestController } from '../ManifestController.js';
import { ProjectController } from '../ProjectController.js';
import type { ReconcileRequest, ReconcileResult } from '../../reconciliation/types.js';

type DirectController = {
  reconcile(req: ReconcileRequest): Promise<ReconcileResult>;
};

const request: ReconcileRequest = {
  projectId: 'project-1',
  controller: 'test',
  reason: 'founder_triggered',
};

function projectLookup(project: Record<string, unknown>) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: project, error: null }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('optional repository capability', () => {
  it('keeps an active project converged when no repository is connected', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return projectLookup({
          id: 'project-1',
          slug: 'offline-first-project',
          name: 'Offline First Project',
          repo_provider: 'none',
          repo_identifier: null,
          status: 'active',
        });
      }
      return {};
    });

    const controller = new ProjectController() as unknown as DirectController;
    const result = await controller.reconcile(request);

    expect(result.status).toBe('converged');
    expect(result.message).toMatch(/active without a repository connection/);
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });

  it('treats repository verification as not applicable when no repository is connected', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return projectLookup({
          id: 'project-1',
          slug: 'offline-first-project',
          name: 'Offline First Project',
          repo_provider: 'none',
          repo_identifier: null,
          status: 'active',
          verification_enabled: true,
        });
      }
      return {};
    });

    const controller = new ManifestController() as unknown as DirectController;
    const result = await controller.reconcile(request);

    expect(result.status).toBe('converged');
    expect(result.message).toMatch(/not applicable/);
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });
});
