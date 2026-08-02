import { describe, expect, it } from 'vitest';
import { executionScopeMatches } from './idempotencyScope.js';

const stored = {
  mission_id: 'mission-a',
  project_id: 'project-a',
  action_type: 'merge',
};

describe('executionScopeMatches', () => {
  it('accepts only the exact mission, project, and action scope', () => {
    expect(executionScopeMatches(stored, {
      missionId: 'mission-a',
      projectId: 'project-a',
      actionType: 'merge',
    })).toBe(true);
  });

  it.each([
    ['mission', { missionId: 'mission-b', projectId: 'project-a', actionType: 'merge' }],
    ['project', { missionId: 'mission-a', projectId: 'project-b', actionType: 'merge' }],
    ['action', { missionId: 'mission-a', projectId: 'project-a', actionType: 'create_branch' }],
    ['unscoped mission', { missionId: null, projectId: 'project-a', actionType: 'merge' }],
  ])('rejects a reused key from a different %s scope', (_label, expected) => {
    expect(executionScopeMatches(stored, expected)).toBe(false);
  });
});
