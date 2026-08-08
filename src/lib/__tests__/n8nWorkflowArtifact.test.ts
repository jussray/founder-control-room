import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(process.cwd(), 'automation/n8n/founder-conveyor.workflow.json');

describe('n8n conveyor workflow artifact', () => {
  it('is importable JSON and disabled by default', () => {
    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    expect(workflow.name).toBe('Founder Control Room Conveyor');
    expect(workflow.active).toBe(false);
    expect(Array.isArray(workflow.nodes)).toBe(true);
    expect(workflow.nodes.map((node: { name: string }) => node.name)).toEqual([
      'FCR Conveyor Webhook',
      'Validate + Route Skills',
      'Create Bound Receipt',
      'Return Receipt',
    ]);
  });

  it('preserves the governed authority and skill-routing contract', () => {
    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const code = workflow.nodes
      .filter((node: { type: string }) => node.type === 'n8n-nodes-base.code')
      .map((node: { parameters: { jsCode: string } }) => node.parameters.jsCode)
      .join('\n');

    expect(code).toContain("authority.merge !== false");
    expect(code).toContain("authority.deploy !== false");
    expect(code).toContain("authority.publish !== false");
    expect(code).toContain("authority.sendExternal !== false");
    expect(code).toContain('lean-build-orchestrator');
    expect(code).toContain('regression-stagnation-guard');
    expect(code).toContain('truth-research-optimizer');
    expect(code).toContain('intent-repair-reader');
    expect(code).toContain('capability-mode-router');
    expect(code).toContain("fcr-n8n-v1:");
  });
});
