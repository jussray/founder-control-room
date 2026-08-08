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

  it('requires instance-bound header auth without committing the bearer secret', () => {
    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const webhook = workflow.nodes.find((node: { name: string }) => node.name === 'FCR Conveyor Webhook');

    expect(webhook.parameters.authentication).toBe('headerAuth');
    expect(webhook.credentials.httpHeaderAuth).toEqual({
      id: 'fcr-conveyor-bearer-auth',
      name: 'FCR Conveyor Bearer Auth',
    });

    const serialized = JSON.stringify(workflow);
    expect(serialized).not.toContain('N8N_CONVEYOR_BEARER_TOKEN');
    expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{12,}/i);
  });

  it('preserves the governed authority, skill routing, and canonical v2 receipt contract', () => {
    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const code = workflow.nodes
      .filter((node: { type: string }) => node.type === 'n8n-nodes-base.code')
      .map((node: { parameters: { jsCode: string } }) => node.parameters.jsCode)
      .join('\n');

    expect(code).toContain("founder-control-room/n8n-conveyor@v2");
    expect(code).toContain("fcr-conveyor-v2:");
    expect(code).toContain("fcr-conveyor-receipt-v2:");
    expect(code).toContain('JSON.stringify([');
    expect(code).toContain('text(input.goal)');
    expect(code).toContain('evidenceUrls');
    expect(code).toContain("authority.merge !== false");
    expect(code).toContain("authority.deploy !== false");
    expect(code).toContain("authority.publish !== false");
    expect(code).toContain("authority.sendExternal !== false");
    expect(code).toContain('lean-build-orchestrator');
    expect(code).toContain('regression-stagnation-guard');
    expect(code).toContain('truth-research-optimizer');
    expect(code).toContain('intent-repair-reader');
    expect(code).toContain('capability-mode-router');
    expect(code).not.toContain('n8n-fcr-v1:');
    expect(code).not.toContain('fcr-n8n-v1:');
  });
});
