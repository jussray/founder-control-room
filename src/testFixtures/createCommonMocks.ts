/**
 * Centralized test mock factory
 * Eliminates 59+ duplicate vi.mock() calls across integration tests.
 * Reduces test boilerplate by ~15-20 lines per test file.
 */
import { vi } from 'vitest';

interface CommonMockFactoryOptions {
  mockSupabase?: boolean;
  mockSupabaseAuth?: boolean;
  mockGitHub?: boolean;
  mockProofGate?: boolean;
  mockOutbox?: boolean;
  customMocks?: Record<string, () => unknown>;
}

/**
 * Factory function to setup common mocks used across integration tests.
 * Returns mock functions to allow per-test configuration.
 */
export function createCommonMocks(options: CommonMockFactoryOptions = {}) {
  const {
    mockSupabase = true,
    mockSupabaseAuth = true,
    mockGitHub = true,
    mockProofGate = true,
    mockOutbox = true,
    customMocks = {},
  } = options;

  // Supabase mocks
  const mockGetUser = vi.fn();
  const supabaseMock = { from: vi.fn() };

  // GitHub mocks
  const mockCreateBranch = vi.fn();
  const mockResolveRef = vi.fn();
  const mockIntegrate = vi.fn();
  const mockCommitPatch = vi.fn();

  // Event/Controller mocks
  const mockEnqueue = vi.fn();
  const mockControllerRun = vi.fn();

  // Setup mocks via vi.hoisted for ESM top-level compatibility
  const mockFactory = vi.hoisted(() => ({
    mockGetUser,
    supabaseMock,
    mockCreateBranch,
    mockResolveRef,
    mockIntegrate,
    mockCommitPatch,
    mockEnqueue,
    mockControllerRun,
  }));

  // Apply standard mocks
  if (mockSupabaseAuth) {
    vi.mock('../../../lib/supabaseAuthClient.js', () => ({
      supabaseAuth: { auth: { getUser: mockFactory.mockGetUser } },
    }));
  }

  if (mockSupabase) {
    vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: mockFactory.supabaseMock }));
  }

  if (mockGitHub) {
    vi.mock('../../../providers/GitHubProvider.js', () => ({
      GitHubProvider: class MockGitHubProvider {
        createBranch = mockFactory.mockCreateBranch;
        resolveRef = mockFactory.mockResolveRef;
        integrate = mockFactory.mockIntegrate;
        commitPatch = mockFactory.mockCommitPatch;
      },
    }));
  }

  if (mockOutbox) {
    vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: mockFactory.mockEnqueue }));
  }

  if (mockProofGate) {
    vi.mock('../../../controllers/ProofGateController.js', () => ({
      ProofGateController: class MockProofGateController {
        run = mockFactory.mockControllerRun;
      },
    }));
  }

  // Apply custom mocks
  Object.entries(customMocks).forEach(([modulePath, moduleFactory]) => {
    vi.mock(modulePath, moduleFactory as any);
  });

  return {
    mockGetUser,
    supabaseMock,
    mockCreateBranch,
    mockResolveRef,
    mockIntegrate,
    mockCommitPatch,
    mockEnqueue,
    mockControllerRun,
  };
}

/**
 * Common test data constants
 */
export const COMMON_TEST_DATA = {
  MISSION_ID: 'mission-uuid-001',
  PROJECT_ID: 'project-uuid-001',
  EXECUTION_ID: 'execution-uuid-001',
  FOUNDER_EMAIL: 'founder@example.com',
  FOUNDER_USER_ID: 'user-uuid-001',
  BEARER: 'Bearer test-token',
  EXPECTED_SHA: 'a'.repeat(40),
};

/**
 * Standard evidence fixture used across tests
 */
export function createValidEvidence(overrides = {}) {
  return {
    filesChanged: ['src/example.ts'],
    behaviorChanged: 'Exact-head verification completed.',
    checksRun: ['typecheck', 'browser_test'],
    failures: [],
    securityImpact: 'none',
    deploymentImpact: 'none',
    rollbackPath: 'Revert the merge commit.',
    unresolvedRisks: [],
    ...overrides,
  };
}
