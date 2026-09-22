import { describe, expect, it } from 'vitest';
import { builderPromptWorkflowRouter } from '../builderPromptWorkflow.js';

// This is deliberately separate from the server-mount gate. It proves the
// route module exists and is an Express router, not that production mounts it.
describe('builder prompt workflow HTTP contract', () => {
  it('exports a concrete router for server integration', () => {
    expect(typeof builderPromptWorkflowRouter).toBe('function');
    expect(Array.isArray(builderPromptWorkflowRouter.stack)).toBe(true);
    expect(builderPromptWorkflowRouter.stack.length).toBeGreaterThan(0);
  });
});
