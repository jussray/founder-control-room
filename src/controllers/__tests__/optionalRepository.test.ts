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

function founderWorkspaceLookup(row: Record<string, unknown> | null) {
  const chain = {
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  return { select: () => chain };
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

  it('does not let a tenant-scoped repository borrow platform provider authority', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return projectLookup({
          id: 'project-1',
          workspace_id: 'tenant-workspace',
          slug: 'tenant-project',
          name: 'Tenant Project',
          repo_provider: 'github',
          repo_identifier: 'tenant/private-project',
          status: 'active',
        });
      }
      if (table === 'founder_users') return founderWorkspaceLookup(null);
      return {};
    });

    const controller = new ProjectController() as unknown as DirectController;
    const result = await controller.reconcile(request);

    expect(result.status).toBe('converged');
    expect(result.message).toMatch(/tenant-scoped.*provider automation is disabled/i);
    expect(providerForProjectMock).not.toHaveBeenCalled();
  });

  it('preserves provider automation for the workspace that owns platform authority', async () => {
    const getProject = vi.fn().mockResolvedValue({
      provider: 'github',
      locator: 'jussray/platform-project',
      name: 'Platform Project',
      isActive: true,
      defaultBranch: 'main',
    });
    const getRef = vi.fn().mockResolvedValue({ commitSha: 'a'.repeat(40), committedAt: null });
    const listVerificationSignals = vi.fn().mockResolvedValue([]);
    providerForProjectMock.mockReturnValue({ getProject, getRef, listVerificationSignals });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return projectLookup({
          id: 'project-1',
          workspace_id: 'platform-workspace',
          slug: 'platform-project',
          name: 'Platform Project',
          repo_provider: 'github',
          repo_identifier: 'jussray/platform-project',
          status: 'active',
        });
      }
      if (table === 'founder_users') {
        return founderWorkspaceLookup({ workspace_id: 'platform-workspace' });
      }
      if (table === 'provider_observations') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });

    const controller = new ProjectController() as unknown as DirectController;
    const result = await controller.reconcile(request);

    expect(result.status).toBe('converged');
    expect(providerForProjectMock).toHaveBeenCalledWith({
      repo_provider: 'github',
      slug: 'platform-project',
      repo_identifier: 'jussray/platform-project',
    });
    expect(getProject).toHaveBeenCalledWith('platform-project');
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