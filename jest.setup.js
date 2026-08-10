// Jest setup for Founder Control Room
// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock GitHub API client
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(() => ({
    repos: {
      getContent: jest.fn(),
      createOrUpdateFileContents: jest.fn(),
    },
    pulls: {
      create: jest.fn(),
      update: jest.fn(),
    },
  })),
}));

// Mock file system operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
}));

// Suppress console output in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};