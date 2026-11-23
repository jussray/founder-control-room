import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('builder prompt workflow server mount', () => {
  it('is mounted behind the normal browser mutation gate', () => {
    const server = readFileSync('src/http/server.ts', 'utf8');
    expect(server).toContain("import { builderPromptWorkflowRouter } from './routes/builderPromptWorkflow.js';");
    expect(server).toContain("app.use('/prompt-workflows', builderPromptWorkflowRouter);");
    expect(server.indexOf('app.use(requireSameOriginBrowserMutation)')).toBeLessThan(
      server.indexOf("app.use('/prompt-workflows', builderPromptWorkflowRouter)"),
    );
  });
});
