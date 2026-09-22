import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// This is deliberately separate from the server-mount gate. It proves the
// route module exists and is an Express router without requiring production
// auth-provider environment just to import the route contract.
describe('builder prompt workflow HTTP contract', () => {
  it('exports a concrete router for server integration', async () => {
    const { builderPromptWorkflowRouter } = await import('../builderPromptWorkflow.js');
    expect(typeof builderPromptWorkflowRouter).toBe('function');
    expect(Array.isArray(builderPromptWorkflowRouter.stack)).toBe(true);
    expect(builderPromptWorkflowRouter.stack.length).toBeGreaterThan(0);
  });
});
