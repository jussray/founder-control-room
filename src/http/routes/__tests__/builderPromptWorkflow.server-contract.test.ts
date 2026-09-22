import { describe, expect, it, vi } from 'vitest';

const { requireFounderMock, rateLimitFounderPermissionsMock } = vi.hoisted(() => ({
  requireFounderMock: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  rateLimitFounderPermissionsMock: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: requireFounderMock,
}));

vi.mock('../../middleware/security.js', () => ({
  rateLimitFounderPermissions: rateLimitFounderPermissionsMock,
}));

interface RouteLayer {
  route?: {
    stack: Array<{ handle: unknown }>;
  };
}

// This is deliberately separate from the server-mount gate. It proves the
// route module exists and is an Express router without requiring production
// auth-provider environment just to import the route contract.
describe('builder prompt workflow HTTP contract', () => {
  it('exports a concrete router and rate-limits before founder auth', async () => {
    const { builderPromptWorkflowRouter } = await import('../builderPromptWorkflow.js');
    expect(typeof builderPromptWorkflowRouter).toBe('function');
    expect(Array.isArray(builderPromptWorkflowRouter.stack)).toBe(true);

    const routes = (builderPromptWorkflowRouter.stack as RouteLayer[])
      .filter((layer) => Boolean(layer.route));
    expect(routes).toHaveLength(2);

    for (const layer of routes) {
      const handlers = layer.route?.stack.map((entry) => entry.handle) ?? [];
      expect(handlers[0]).toBe(rateLimitFounderPermissionsMock);
      expect(handlers[1]).toBe(requireFounderMock);
    }
  });
});
