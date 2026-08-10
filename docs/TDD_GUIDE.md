# Test-Driven Development Guide for Founder Control Room

## Overview

This guide introduces Test-Driven Development (TDD) practices for the Founder Control Room project. TDD ensures that mission management, approval processes, and repository operations are thoroughly tested and reliable.

## The Red-Green-Refactor Cycle

### 🔴 Red: Write Failing Test
Start with a test that describes desired behavior:

```typescript
it('should create a mission with valid parameters', () => {
  const mission = engine.createMission({
    title: 'Deploy feature',
    description: 'Deployment mission',
    priority: 'high',
  });
  
  expect(mission.title).toBe('Deploy feature');
  expect(mission.status).toBe(MissionStatus.PENDING);
});
```

### 🟢 Green: Write Minimal Code
Implement just enough to pass the test:

```typescript
createMission(config: MissionConfig): Mission {
  return {
    id: `mission_${Date.now()}`,
    title: config.title,
    description: config.description,
    priority: config.priority,
    status: MissionStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
```

### 🔵 Refactor: Improve Code
Refactor while keeping tests green.

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage

# Run specific test file
npm test mission.test.ts
```

## Testing Patterns for Founder Control Room

### Mission Management Tests
```typescript
describe('Mission Engine', () => {
  it('should manage mission lifecycle', () => {
    const mission = engine.createMission({...});
    engine.startMission(mission.id);
    engine.completeMission(mission.id);
    
    expect(mission.status).toBe(MissionStatus.COMPLETED);
  });
});
```

### Approval Process Tests
```typescript
describe('Approval Engine', () => {
  it('should require approval before deployment', () => {
    const change = proposalEngine.createProposal({...});
    
    expect(() => change.deploy()).toThrow('Approval required');
    
    approvalEngine.approve(change.id);
    expect(() => change.deploy()).not.toThrow();
  });
});
```

## Best Practices

1. **Test behavior, not implementation** - Write tests for what the code should do
2. **Keep tests focused** - One assertion per test when possible
3. **Use descriptive names** - Test names should clearly state expectations
4. **Mock external dependencies** - GitHub API, file system, databases
5. **Test edge cases** - Error conditions, boundary values, invalid inputs
6. **Maintain test isolation** - Tests should not depend on each other

## Coverage Targets

- **Branches**: 60%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

## Next Steps

1. Review example tests in `src/__tests__/`
2. Apply TDD to new features
3. Maintain coverage thresholds
4. Integrate with CI/CD pipeline

Happy testing! 🚀