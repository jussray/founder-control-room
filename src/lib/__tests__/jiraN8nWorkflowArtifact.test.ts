import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface WorkflowNode {
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  alwaysOutputData?: boolean;
}

interface WorkflowArtifact {
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

const artifactPath = resolve(process.cwd(), 'automation/n8n/jira-work-automation.workflow.json');
const rawArtifact = readFileSync(artifactPath, 'utf8');
const workflow = JSON.parse(rawArtifact) as WorkflowArtifact;

function node(name: string): WorkflowNode {
  const found = workflow.nodes.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing workflow node: ${name}`);
  return found;
}

function serializedParameters(name: string): string {
  return JSON.stringify(node(name).parameters ?? {});
}

describe('n8n Jira work automation artifact', () => {
  it('ships inactive and without embedded credential bindings or secret values', () => {
    expect(workflow.name).toBe('FCR Jira Work Automation v1');
    expect(workflow.active).toBe(false);
    expect(workflow.settings?.executionOrder).toBe('v1');
    expect(workflow.nodes.every((candidate) => candidate.credentials === undefined)).toBe(true);

    expect(rawArtifact).not.toMatch(/api[_-]?token|password|secret-token|bridge-secret/i);
    expect(rawArtifact).not.toContain('N8N_JIRA_AUTOMATION_BEARER_TOKEN');
  });

  it('requires authenticated webhook ingress and an explicit response node', () => {
    const ingress = node('Inbound FCR Jira Plan');
    expect(ingress.type).toBe('n8n-nodes-base.webhook');
    expect(ingress.parameters).toMatchObject({
      authentication: 'headerAuth',
      httpMethod: 'POST',
      path: 'fcr-jira-work-automation-v1',
      responseMode: 'responseNode',
    });
    expect(node('Return Receipt').type).toBe('n8n-nodes-base.respondToWebhook');
  });

  it('validates the exact contract, transport idempotency binding, runtime head, and authority ceiling', () => {
    const validation = serializedParameters('Validate FCR Plan');
    expect(validation).toContain('founder-control-room/jira-work-automation@v1');
    expect(validation).toContain('idempotency-key');
    expect(validation).toContain('x-fcr-jira-automation-contract');
    expect(validation).toContain('runtimeHeadSha');
    expect(validation).toContain('transitionIssue');
    expect(validation).toContain('closeIssue');
    expect(validation).toContain('deleteIssue');
    expect(validation).toContain('mutateProjectSettings');
    expect(validation).toContain("action.type !== 'assign-owner' && action.type !== 'comment-stale'");
    expect(validation).toContain("ownerLabel !== 'sekretbip'");
    expect(validation).toContain("crypto.subtle.digest('SHA-256'");
  });

  it('re-reads only the target Jira issue before opening any mutation', () => {
    const reread = node('Re-read Jira Issue');
    expect(reread.type).toBe('n8n-nodes-base.httpRequest');
    expect(reread.parameters?.authentication).toBe('predefinedCredentialType');
    expect(reread.parameters?.nodeCredentialType).toBe('jiraSoftwareCloudApi');

    const serialized = serializedParameters('Re-read Jira Issue');
    expect(serialized).toContain('/rest/api/3/issue/');
    expect(serialized).toContain('fields=status,assignee,updated');
    expect(serialized).not.toContain('/transitions');
  });

  it('fails closed on status, assignee, timestamp, or stale-threshold drift', () => {
    const guard = serializedParameters('Guard State and Expand Actions');
    expect(guard).toContain('status changed after FCR observation');
    expect(guard).toContain('assignee changed after FCR observation');
    expect(guard).toContain('updated timestamp changed after FCR observation');
    expect(guard).toContain('assignment no longer unowned');
    expect(guard).toContain('stale threshold no longer satisfied');
  });

  it('can emit only Jira assignment PUTs or comment POSTs', () => {
    const guard = serializedParameters('Guard State and Expand Actions');
    expect(guard).toContain("method: 'PUT'");
    expect(guard).toContain("method: 'POST'");
    expect(guard).toContain('assignee');
    expect(guard).toContain('/comment');

    const mutation = node('Apply Bounded Jira Mutation');
    expect(mutation.type).toBe('n8n-nodes-base.httpRequest');
    expect(mutation.alwaysOutputData).toBe(true);
    expect(mutation.parameters?.method).toBe('={{$json.request.method}}');
    expect(mutation.parameters?.authentication).toBe('predefinedCredentialType');
    expect(mutation.parameters?.nodeCredentialType).toBe('jiraSoftwareCloudApi');

    expect(rawArtifact).not.toContain('/transitions');
    expect(rawArtifact).not.toMatch(/method['\"]?\s*:\s*['\"]DELETE/i);
    expect(rawArtifact).not.toContain('/rest/api/3/project/');
  });

  it('returns only a receipt recomputed from the exact FCR plan after all bounded mutations complete', () => {
    const receipt = serializedParameters('Build Exact Receipt');
    expect(receipt).toContain('expectedReceiptId');
    expect(receipt).toContain('results.length !== plan.actions.length');
    expect(receipt).toContain('runtimeHeadSha');
    expect(receipt).toContain('issueKey');
    expect(receipt).toContain('mutatedActions');

    const connections = JSON.stringify(workflow.connections);
    const orderedNodes = [
      'Inbound FCR Jira Plan',
      'Validate FCR Plan',
      'Re-read Jira Issue',
      'Guard State and Expand Actions',
      'Apply Bounded Jira Mutation',
      'Build Exact Receipt',
      'Return Receipt',
    ];
    for (const name of orderedNodes) expect(connections).toContain(name);
  });
});
